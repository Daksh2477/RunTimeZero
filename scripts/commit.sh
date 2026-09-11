#!/usr/bin/env bash
# Stage everything and commit with a one-line imperative message.
#
#   ./scripts/commit.sh "add solar irradiance model"
#
# Refuses to commit directly on main or develop — branch first.
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: ./scripts/commit.sh \"imperative one-line message\"" >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

MSG="$*"
case "$MSG" in
  *[!\ ]*) ;;
  *) echo "empty commit message" >&2; exit 1 ;;
esac

git add -A
if git diff --cached --quiet; then
  echo "nothing staged — no changes to commit."
  exit 0
fi

git commit -m "$MSG"
echo "committed on $BRANCH"
