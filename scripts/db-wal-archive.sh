#!/bin/sh
# PostgreSQL archive_command helper for a dedicated Linux filesystem destination.
set -eu
umask 077
test "$#" -eq 3
destination=$1
source=$2
name=$3
case "$destination" in /*) ;; *) exit 1 ;; esac
case "$name" in ''|.*|*[!A-Za-z0-9.]*) exit 1 ;; esac
test "${#name}" -le 64
test -f "$source"
test -d "$destination"
test -f "$destination/.wal-archive-ready"
target="$destination/$name"

if test -e "$target" || test -L "$target"; then
  test ! -L "$target"
  test -f "$target"
  cmp -s "$source" "$target"
  sync -f "$destination"
  exit 0
fi

temp=$(mktemp "$destination/.wal-partial.XXXXXXXX")
trap 'rm -f -- "$temp"' EXIT
trap 'exit 1' HUP INT TERM
cp -- "$source" "$temp"
sync -f "$temp"
if ! ln -T -- "$temp" "$target"; then
  test ! -L "$target"
  test -f "$target"
  cmp -s "$temp" "$target"
fi
# Flush the destination filesystem before acknowledging the archive.
sync -f "$destination"
