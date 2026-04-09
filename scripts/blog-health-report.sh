#!/usr/bin/env bash

set -euo pipefail

run_build="false"
if [[ "${1:-}" == "--build" ]]; then
  run_build="true"
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

human_size() {
  local path="$1"
  if [[ -e "$path" ]]; then
    du -sh "$path" | awk '{print $1}'
  else
    printf "n/a"
  fi
}

printf "Blog health report\n"
printf "Repository: %s\n\n" "$repo_root"

if [[ "$run_build" == "true" ]]; then
  printf "Running build...\n"
  start_ts="$(date +%s)"
  bundle exec jekyll build >/tmp/blog-health-build.log 2>&1
  end_ts="$(date +%s)"
  printf "Build duration: %ss\n\n" "$((end_ts - start_ts))"
fi

printf "Post counts by top-level content path\n"
printf "%-18s %8s\n" "path" "count"
printf "%-18s %8s\n" "----" "-----"

find _posts -mindepth 1 -maxdepth 1 -type d | sort | while IFS= read -r dir; do
  name="$(basename "$dir")"
  count="$(find "$dir" -type f \( -name '*.md' -o -name '*.markdown' \) | wc -l | tr -d ' ')"
  printf "%-18s %8s\n" "$name" "$count"
done

printf "\n"
printf "Total markdown posts: %s\n" "$(find _posts -type f \( -name '*.md' -o -name '*.markdown' \) | wc -l | tr -d ' ')"
printf "Post image directory size: %s\n" "$(human_size assets/img/posts)"
printf "Generated site size: %s\n" "$(human_size _site)"

if [[ -f "_site/assets/js/data/search.json" ]]; then
  search_bytes="$(wc -c < "_site/assets/js/data/search.json" | tr -d ' ')"
  printf "Generated search index size: %s bytes\n" "$search_bytes"
else
  printf "Generated search index size: n/a (_site/assets/js/data/search.json missing)\n"
fi
