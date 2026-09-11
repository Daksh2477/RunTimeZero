#!/usr/bin/env bash
# Push the current branch and set upstream on first push.
#
# Never force-pushes. If the remote has moved, pull with rebase yourself and
# look at what changed — do not reach for --force.
set -euo pipefail

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# Single-branch flow: main is where we work. Pull before you push so you
# rebase onto whatever a teammate landed while you were editing.
git pull --rebase --autostash

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git push
else
  git push -u origin "$BRANCH"
fi

echo "pushed $BRANCH"
