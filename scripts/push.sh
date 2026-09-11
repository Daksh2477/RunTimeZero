#!/usr/bin/env bash
# Push the current branch and set upstream on first push.
#
# Never force-pushes. If the remote has moved, pull with rebase yourself and
# look at what changed — do not reach for --force.
set -euo pipefail

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ "$BRANCH" = "main" ]; then
  read -r -p "pushing to main. are you sure? [y/N] " reply
  [ "$reply" = "y" ] || { echo "aborted."; exit 1; }
fi

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git push
else
  git push -u origin "$BRANCH"
fi

echo "pushed $BRANCH"
