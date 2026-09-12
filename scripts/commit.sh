#!/usr/bin/env bash
# Commit specific paths with a one-line imperative message.
#
#   ./scripts/commit.sh "add solar irradiance model" packages/physics/src/solar.rs
#   ./scripts/commit.sh "fix ndci band" apps/api/src/reconcile/ docs/
#
# PATHS ARE REQUIRED, and that is deliberate.
#
# Two agents share this working tree. An earlier version of this script ran
# `git add -A`, which would sweep up whatever the other agent had half-finished
# and commit it under your message — silently, and impossible to untangle later.
# Naming your paths is the only thing that keeps the two of you apart.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: ./scripts/commit.sh \"message\" <path> [path...]" >&2
  echo >&2
  echo "paths are required — another agent may have uncommitted work in this tree." >&2
  echo "check with:  git status --short" >&2
  exit 1
fi

MSG="$1"
shift

for p in "$@"; do
  if [ ! -e "$p" ]; then
    echo "path does not exist: $p" >&2
    exit 1
  fi
done

git add -- "$@"

if git diff --cached --quiet; then
  echo "nothing staged from those paths — no changes to commit."
  exit 0
fi

echo "staging:"
git diff --cached --name-only | sed 's/^/  /'

git commit -m "$MSG"
echo "committed on $(git rev-parse --abbrev-ref HEAD)"
