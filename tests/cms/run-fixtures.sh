#!/usr/bin/env bash
# Negative cases for the Stage 0 content contract.
#
# Each fixture is a miniature repository: _posts plus the dictionaries the
# validator reads. CMS_CONTENT_ROOT points the validator at one, so deliberately
# broken posts never have to live in the real _posts.
#
#   bash tests/cms/run-fixtures.sh

set -uo pipefail
cd "$(dirname "$0")/../.."

pass=0
fail=0

expect() { # <fixture> <expected exit> <text the output must contain>
  local fixture="$1" want="$2" needle="$3" out status
  out="$(CMS_CONTENT_ROOT="tests/cms/fixtures/$fixture" ruby scripts/cms/validate-content.rb --quiet 2>&1)"
  status=$?

  if [ "$status" -eq "$want" ] && { [ -z "$needle" ] || printf '%s' "$out" | grep -q -- "$needle"; }; then
    printf 'ok    %-16s exit=%s\n' "$fixture" "$status"
    pass=$((pass + 1))
  else
    printf 'FAIL  %-16s exit=%s (wanted %s, matching "%s")\n%s\n' \
      "$fixture" "$status" "$want" "$needle" "$out"
    fail=$((fail + 1))
  fi
}

expect clean           0 ''
expect broken-yaml     1 'invalid YAML'
expect forbidden-key   1 'status is the only visibility field'
expect unknown-series  1 'has no _series_pages entry'
expect duplicate-order 1 'posts at order 2'

# The real repository has to satisfy its own contract.
if ruby scripts/cms/validate-content.rb --quiet >/dev/null 2>&1; then
  printf 'ok    %-16s exit=0\n' "_posts"
  pass=$((pass + 1))
else
  printf 'FAIL  %-16s the repository violates the contract\n' "_posts"
  ruby scripts/cms/validate-content.rb --quiet
  fail=$((fail + 1))
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
