#!/bin/sh
set -eu
export LC_ALL=C
root=$(mktemp -d)
primary="$root/primary"
restore="$root/restore"
offsite=$(mktemp -d)
archive="$offsite/wal"
mkdir "$archive"
probe="$root/archive-probe"
probe_name=000000FF.history
printf 'original' > "$probe"
if sh "$WAL_ARCHIVE_HELPER" "$archive" "$probe" "$probe_name"; then
  echo "Archive unexpectedly accepted a destination without its marker" >&2
  exit 1
fi
touch "$archive/.wal-archive-ready"
sh "$WAL_ARCHIVE_HELPER" "$archive" "$probe" "$probe_name"
sh "$WAL_ARCHIVE_HELPER" "$archive" "$probe" "$probe_name"
printf 'changed' > "$probe"
if sh "$WAL_ARCHIVE_HELPER" "$archive" "$probe" "$probe_name"; then
  echo "Archive unexpectedly accepted a different file with the same name" >&2
  exit 1
fi
test "$(cat "$archive/$probe_name")" = original
trap 'pg_ctl -D "$restore" -m immediate stop >/dev/null 2>&1 || true; pg_ctl -D "$primary" -m immediate stop >/dev/null 2>&1 || true' EXIT
initdb -D "$primary" --auth=trust --no-locale >/dev/null
cat >> "$primary/postgresql.conf" <<CONFIG
listen_addresses = ''
unix_socket_directories = '$root'
port = 5541
wal_level = replica
archive_mode = on
archive_command = 'sh "$WAL_ARCHIVE_HELPER" "$archive" "%p" "%f"'
CONFIG
pg_ctl -D "$primary" -l "$root/primary.log" -w -t 30 start >/dev/null
primary_sql() { psql -X -v ON_ERROR_STOP=1 -h "$root" -p 5541 -d postgres "$@"; }
primary_sql -qc "CREATE TABLE markers (mark text PRIMARY KEY); INSERT INTO markers VALUES ('in_base');"
pg_basebackup -h "$root" -p 5541 -D "$offsite/base" -X stream --checkpoint=fast
primary_sql -qc "INSERT INTO markers VALUES ('before_target');"
target=$(primary_sql -Atc "SELECT clock_timestamp()")
primary_sql -qc "INSERT INTO markers VALUES ('after_target');"
test "$(primary_sql -Atc "SELECT string_agg(mark,',' ORDER BY mark) FROM markers")" = "after_target,before_target,in_base"
required_wal=$(primary_sql -Atc 'SELECT pg_walfile_name(pg_current_wal_insert_lsn())')
primary_sql -qc "CREATE ROLE wal_monitor LOGIN; GRANT pg_monitor TO wal_monitor;"
health() { primary_sql -U wal_monitor -Atf "$WAL_HEALTH_SQL"; }
mv "$archive/.wal-archive-ready" "$root/offline-marker"
primary_sql -Atc 'SELECT pg_switch_wal()' >/dev/null
failed_report=''
for n in $(seq 1 30); do
  failed_report=$(health)
  if printf '%s' "$failed_report" | grep -F 'archive_failed_with_pending_wal' >/dev/null; then break; fi
  sleep 1
done
printf '%s' "$failed_report" | grep -F '"healthy": false' >/dev/null
printf '%s' "$failed_report" | grep -F 'archive_failed_with_pending_wal' >/dev/null
test ! -e "$archive/$required_wal"
mv "$root/offline-marker" "$archive/.wal-archive-ready"
# Wake the archiver rather than waiting for its periodic retry.
pg_ctl -D "$primary" reload >/dev/null
primary_sql -qc "INSERT INTO markers VALUES ('after_reconnect'); SELECT pg_switch_wal();" >/dev/null
recovered_report=''
for n in $(seq 1 30); do
  recovered_report=$(health)
  if test -s "$archive/$required_wal" && printf '%s' "$recovered_report" | grep -F '"healthy": true' >/dev/null; then break; fi
  sleep 1
done
test -s "$archive/$required_wal"
printf '%s' "$recovered_report" | grep -F '"healthy": true' >/dev/null
printf 'WAL health passed: unreachable archive detected and recovered\n'
pg_ctl -D "$primary" -m fast -w stop >/dev/null
mv "$primary" "$root/primary-offline"
pg_verifybackup "$offsite/base" >/dev/null
cp -a "$offsite/base" "$restore"

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
grep -F "restored log file \"$required_wal\" from archive" "$root/restore.log" >/dev/null
printf 'Offsite simulation PITR passed: target=%s markers=%s archived_wal=%s\n' "$target" "$markers" "$required_wal"
