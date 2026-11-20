#!/bin/sh
set -eu
export LC_ALL=C
root=$(mktemp -d)
primary="$root/primary"
restore="$root/restore"
offsite=$(mktemp -d "$WAL_DRILL_OFFSITE_ROOT/narenj-wal-drill.XXXXXXXX")
archive="$offsite/wal"
trap 'pg_ctl -D "$restore" -m immediate stop >/dev/null 2>&1 || true; pg_ctl -D "$primary" -m immediate stop >/dev/null 2>&1 || true; case "$offsite" in "$WAL_DRILL_OFFSITE_ROOT"/narenj-wal-drill.????????) rm -rf -- "$offsite";; esac' EXIT
mkdir "$archive"
probe="$root/archive-probe"
probe_name=000000FF.history
printf 'original' > "$probe"
if sh "$WAL_ARCHIVE_HELPER" "$archive" "$probe" "$probe_name"; then
  echo "Archive unexpectedly accepted a destination without its marker" >&2
  exit 1
fi
touch "$archive/.wal-archive-ready"
printf 'Idle destination before disconnect: '
sh "$WAL_DESTINATION_HELPER" "$archive"
mv "$archive/.wal-archive-ready" "$root/idle-offline-marker"
printf 'Idle destination while disconnected: '
if sh "$WAL_DESTINATION_HELPER" "$archive"; then
  echo "Idle destination monitor accepted missing marker" >&2
  exit 1
else
  test "$?" -eq 1
fi
mv "$root/idle-offline-marker" "$archive/.wal-archive-ready"
printf 'Idle destination after reconnect: '
sh "$WAL_DESTINATION_HELPER" "$archive"
sh "$WAL_ARCHIVE_HELPER" "$archive" "$probe" "$probe_name"
sh "$WAL_ARCHIVE_HELPER" "$archive" "$probe" "$probe_name"
printf 'changed' > "$probe"
if sh "$WAL_ARCHIVE_HELPER" "$archive" "$probe" "$probe_name"; then
  echo "Archive unexpectedly accepted a different file with the same name" >&2
  exit 1
fi
test "$(cat "$archive/$probe_name")" = original
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
monotonic_seconds() { awk '{ print $1 }' /proc/uptime; }
elapsed() { awk -v start="$1" -v finish="$2" 'BEGIN { printf "%.3f", finish-start }'; }
primary_sql -qc "CREATE TABLE markers (mark text PRIMARY KEY); INSERT INTO markers VALUES ('in_base'); CREATE TABLE workload (phase int NOT NULL, recorded_at timestamptz DEFAULT clock_timestamp(), payload text NOT NULL);"
cat > "$root/workload.sql" <<'SQL'
INSERT INTO workload(phase,payload) VALUES (:phase,repeat(md5(random()::text),32));
SQL
run_load() { pgbench -n -h "$root" -p 5541 -c 4 -j 2 -t "${2:-$WAL_DRILL_TRANSACTIONS_PER_CLIENT}" -D phase="$1" -f "$root/workload.sql" postgres; }
if test "$WAL_DRILL_BASE_TRANSACTIONS_PER_CLIENT" -gt 0; then run_load 0 "$WAL_DRILL_BASE_TRANSACTIONS_PER_CLIENT"; fi
pg_basebackup -h "$root" -p 5541 -D "$offsite/base" -X stream --checkpoint=fast
run_load 1
primary_sql -qc "INSERT INTO markers VALUES ('before_target');"
target=$(primary_sql -Atc "SELECT clock_timestamp()")
primary_sql -qc "INSERT INTO markers VALUES ('after_target');"
test "$(primary_sql -Atc "SELECT string_agg(mark,',' ORDER BY mark) FROM markers")" = "after_target,before_target,in_base"
primary_sql -qc "CREATE ROLE wal_monitor LOGIN; GRANT pg_monitor TO wal_monitor;"
health() { primary_sql -U wal_monitor -Atf "$WAL_HEALTH_SQL"; }
outage_started=$(monotonic_seconds)
mv "$archive/.wal-archive-ready" "$root/offline-marker"
run_load 2
required_wal=$(primary_sql -Atc 'SELECT pg_walfile_name(pg_current_wal_insert_lsn())')
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
alert_seconds=$(elapsed "$outage_started" "$(monotonic_seconds)")
printf 'Unhealthy WAL probe: %s\n' "$failed_report"
limit_report=$(PGOPTIONS='-c narenj.wal_max_directory_bytes=1' health)
printf '%s' "$limit_report" | grep -F 'wal_directory_limit' >/dev/null
sh "$WAL_FS_HELPER" "$primary/pg_wal"
if WAL_MAX_FILESYSTEM_PERCENT=1 sh "$WAL_FS_HELPER" "$primary/pg_wal"; then
  echo "Expected filesystem threshold failure" >&2
  exit 1
else
  test "$?" -eq 1
fi
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
source_rows=$(primary_sql -Atc "SELECT count(*) FROM workload")
expected_batch=$((4 * WAL_DRILL_TRANSACTIONS_PER_CLIENT))
expected_base=$((4 * WAL_DRILL_BASE_TRANSACTIONS_PER_CLIENT))
test "$source_rows" -eq "$((2 * expected_batch + expected_base))"
source_stop_epoch=$(primary_sql -Atc "SELECT extract(epoch FROM clock_timestamp())")
recovery_started=$(monotonic_seconds)
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
# The target can precede the last archived segment from the second batch.
grep -F 'restored log file' "$root/restore.log" >/dev/null
restored_rows=$(restored_sql -Atc "SELECT count(*) FROM workload")
test "$restored_rows" -eq "$((expected_batch + expected_base))"
test "$(restored_sql -Atc "SELECT count(*) FROM workload WHERE phase NOT IN (0,1)")" -eq 0
last_recovered_epoch=$(restored_sql -Atc "SELECT extract(epoch FROM max(recorded_at)) FROM workload")
rpo_seconds=$(elapsed "$last_recovered_epoch" "$source_stop_epoch")
rto_seconds=$(elapsed "$recovery_started" "$(monotonic_seconds)")
printf 'Bundle size: base_kib=%s archive_kib=%s\n' "$(du -sk "$offsite/base" | cut -f1)" "$(du -sk "$archive" | cut -f1)"
printf 'Load recovery: source_rows=%s restored_rows=%s omitted_rows=%s observed_rpo_seconds=%s observed_rto_seconds=%s outage_alert_seconds=%s\n' "$source_rows" "$restored_rows" "$((source_rows-restored_rows))" "$rpo_seconds" "$rto_seconds" "$alert_seconds"
printf 'Offsite simulation PITR passed: target=%s markers=%s archived_wal=%s\n' "$target" "$markers" "$required_wal"
