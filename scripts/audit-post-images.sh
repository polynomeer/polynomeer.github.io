#!/usr/bin/env bash

set -euo pipefail

warn_kb="${1:-300}"
critical_kb="${2:-800}"
root_dir="${3:-assets/img/posts}"

if [[ ! -d "$root_dir" ]]; then
  echo "Directory not found: $root_dir" >&2
  exit 1
fi

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

find "$root_dir" -type f | while IFS= read -r file; do
  bytes="$(wc -c < "$file" | tr -d ' ')"
  kb="$(( (bytes + 1023) / 1024 ))"
  level="ok"

  if (( kb >= critical_kb )); then
    level="critical"
  elif (( kb >= warn_kb )); then
    level="warn"
  fi

  printf "%08d\t%-8s\t%s\n" "$kb" "$level" "$file"
done | sort -r > "$tmp_file"

printf "Image audit for %s\n" "$root_dir"
printf "Warn threshold: %s KB\n" "$warn_kb"
printf "Critical threshold: %s KB\n\n" "$critical_kb"

awk -F '\t' '
  BEGIN {
    printf "%8s  %-8s  %s\n", "size_kb", "status", "path"
    printf "%8s  %-8s  %s\n", "-------", "------", "----"
  }
  {
    size = $1 + 0
    status = $2
    path = $3
    printf "%8d  %-8s  %s\n", size, status, path
  }
' "$tmp_file"
