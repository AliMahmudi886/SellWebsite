#!/bin/sh
set -eu
export LC_ALL=C
directory=${1:-${PGDATA:-}/pg_wal}
min_free=${WAL_MIN_FREE_KIB:-1048576}
max_used=${WAL_MAX_FILESYSTEM_PERCENT:-85}
case "$min_free" in ''|*[!0-9]*) exit 2 ;; esac
case "$max_used" in ''|*[!0-9]*) exit 2 ;; esac
test "$max_used" -ge 1 && test "$max_used" -le 100 || exit 2
test -d "$directory" || exit 2
metrics=$(df -Pk "$directory") || exit 2
printf '%s\n' "$metrics" | awk -v minimum="$min_free" -v maximum="$max_used" '
  NR == 2 {
    if ($4 !~ /^[0-9]+$/ || $5 !~ /^[0-9]+%$/) exit 2
    capacity=$5; sub(/%$/, "", capacity)
    unhealthy=($4 < minimum || capacity >= maximum)
    printf "{\"healthy\":%s,\"available_kib\":%.0f,\"used_percent\":%d}\n", unhealthy ? "false" : "true", $4, capacity
    exit unhealthy ? 1 : 0
  }
  END { if (NR < 2) exit 2 }
'
