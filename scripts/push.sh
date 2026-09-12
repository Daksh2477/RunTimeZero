#!/usr/bin/env bash
# Push the current branch and set upstream on first push.
#
# Never force-pushes, never stashes. Both agents share one working tree, so a
# stash would lift the other agent's uncommitted edits out from under them.
set -euo pipefail

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git fetch --quiet
  # Shared tree means one local branch, so the remote only moves ahead of us
  # when someone pushed from elsewhere. Stop rather than stash to rebase.
  if ! git merge-base --is-ancestor '@{u}' HEAD; then
    echo "remote $BRANCH has commits this tree lacks; stop and tell the user (no stash, no force)" >&2
    exit 1
  fi
  git push
else
  git push -u origin "$BRANCH"
fi

echo "pushed $BRANCH"
