#!/bin/sh
set -eu
export LC_ALL=C
root=$(mktemp -d)
primary="$root/primary"
restore="$root/restore"
archive="$root/archive"
mkdir "$archive"
trap 'pg_ctl -D "$restore" -m immediate stop >/dev/null 2>&1 || true; pg_ctl -D "$primary" -m immediate stop >/dev/null 2>&1 || true' EXIT
initdb -D "$primary" --auth=trust --no-locale >/dev/null
cat >> "$primary/postgresql.conf" <<CONFIG
listen_addresses = ''
unix_socket_directories = '$root'
port = 5541
wal_level = replica
archive_mode = on
archive_command = 'if test -f "$archive/%f"; then cmp -s "%p" "$archive/%f"; else cp "%p" "$archive/%f.tmp" && mv "$archive/%f.tmp" "$archive/%f"; fi'
CONFIG
pg_ctl -D "$primary" -l "$root/primary.log" -w -t 30 start >/dev/null
primary_sql() { psql -X -v ON_ERROR_STOP=1 -h "$root" -p 5541 -d postgres "$@"; }
primary_sql -qc "CREATE TABLE markers (mark text PRIMARY KEY); INSERT INTO markers VALUES ('in_base');"
pg_basebackup -h "$root" -p 5541 -D "$restore" -X stream --checkpoint=fast
primary_sql -qc "INSERT INTO markers VALUES ('before_target');"
target=$(primary_sql -Atc "SELECT clock_timestamp()")
primary_sql -qc "INSERT INTO markers VALUES ('after_target');"
test "$(primary_sql -Atc "SELECT string_agg(mark,',' ORDER BY mark) FROM markers")" = "after_target,before_target,in_base"
required_wal=$(primary_sql -Atc 'SELECT pg_walfile_name(pg_current_wal_insert_lsn())')
primary_sql -Atc 'SELECT pg_switch_wal()' >/dev/null
for n in $(seq 1 30); do
  test ! -s "$archive/$required_wal" || break
  sleep 1
done
test -s "$archive/$required_wal"
pg_ctl -D "$primary" -m fast -w stop >/dev/null

cat >> "$restore/postgresql.conf" <<CONFIG
port = 5542
archive_mode = off
restore_command = 'cp "$archive/%f" "%p"'
recovery_target_time = '$target'
recovery_target_action = 'promote'
recovery_target_timeline = 'current'
CONFIG
touch "$restore/recovery.signal"
pg_ctl -D "$restore" -l "$root/restore.log" -w -t 30 start >/dev/null
restored_sql() { psql -X -v ON_ERROR_STOP=1 -h "$root" -p 5542 -d postgres "$@"; }
for n in $(seq 1 30); do
  test "$(restored_sql -Atc 'SELECT pg_is_in_recovery()' 2>/dev/null || true)" = f && break
  sleep 1
done
test "$(restored_sql -Atc 'SELECT pg_is_in_recovery()')" = f
markers=$(restored_sql -Atc "SELECT string_agg(mark,',' ORDER BY mark) FROM markers")
test "$markers" = "before_target,in_base"
grep -F 'restored log file' "$root/restore.log" >/dev/null
printf 'PITR passed: target=%s markers=%s archived_wal=%s\n' "$target" "$markers" "$required_wal"
