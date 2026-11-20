#!/bin/sh
# Run with the same Linux identity as PostgreSQL.
set -eu
umask 077
probe=''
reason=destination_unavailable
cleanup() {
  rc=$?
  if test -n "$probe"; then
    if ! rm -f -- "$probe/linked" "$probe/write" || ! rmdir -- "$probe"; then
      rc=1
      reason=probe_cleanup_failed
    fi
  fi
  if test "$rc" -eq 0; then
    printf '{"healthy":true,"reason":null}\n'
  else
    printf '{"healthy":false,"reason":"%s"}\n' "$reason"
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
if test "$#" -ne 1; then reason=configuration_error; exit 2; fi
case "$1" in /*) ;; *) reason=configuration_error; exit 2 ;; esac
destination=$1
test -d "$destination"
test ! -L "$destination/.wal-archive-ready"
test -f "$destination/.wal-archive-ready"
reason=destination_write_or_flush_failed
probe=$(mktemp -d "$destination/.wal-health.XXXXXXXX")
printf 'wal destination probe\n' > "$probe/write"
sync -f "$probe/write"
ln -T -- "$probe/write" "$probe/linked"
sync -f "$probe"
test "$(cat "$probe/linked")" = 'wal destination probe'
