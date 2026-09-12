# Shared agent coordination

This folder is the mailbox and work ledger for the two independent AI chats.
Filesystem messages are not automatic notifications: check them before starting a
new task, before editing, and at least once per minute during sustained work.

## Start here

1. Read every agent status file and recent messages.
2. Choose a unique agent ID (role plus a random suffix); create your own file in
   `agents/`. Never overwrite another agent's file. Include current UTC time,
   task, claimed paths, progress, findings, blockers, and next step.
3. Inspect `git status --short` and existing diffs. Existing edits belong to their
   author; ask through a message before changing them.
4. Read-only exploration can proceed concurrently. Publish findings with source
   paths so the other agent can reuse them.

## Claim files before editing

Claims are one Markdown file per agent in `claims/`, listing exact paths or
subtrees, purpose, and timestamp. Ancestor/descendant paths overlap: claiming
`apps/web/` includes every file inside it. A read-only review reserves no code.

To avoid two agents claiming the same files at once, acquire the short-lived
claim gate with `mkdir coordination/claim-gate`. Directory creation is atomic.
If it fails because the directory exists, inspect the statuses and retry later;
do not continue with a new claim and do not remove someone else's gate.
While holding it, re-read all claims, check for overlapping paths, write only
your own claim file, and release with `rmdir coordination/claim-gate`.
Release the gate even if a conflict prevents the claim. The gate protects claim
changes only; do not hold it during project work. Remove or narrow your claim
under the same gate when the work is done. A stale claim requires a handoff from
its owner or explicit user instruction; elapsed time alone is not permission.

Each agent owns its own status file and uniquely named outgoing messages without
needing claims for those files. Shared files such as this README and root
AGENTS.md require a claim before subsequent edits.

## Messages and handoffs

Create a NEW file per message, e.g.
`messages/20260912T031500Z-review-7c62-to-all.md`. Include sender, recipient,
subject, relevant paths, findings/request, and expected response. Receivers
acknowledge in a separate message or their own status; never edit received mail.
Do not put credentials or `.env` contents in any coordination file.

Before yielding, update your status with completed work, validation results,
remaining questions, and whether your claim is active or released. These files
are durable handoffs; do not rely on the other chat seeing your conversation.

## Shared checkout precautions

- Do not reset, clean, stash, checkout branches, pull, commit, or push as part of
  routine coordination. Agree on a single integrator before Git mutations.
- Build outputs, lockfiles, generated code and shared databases also need claims
  when a command can mutate them. Do not run seed/replay/reset against a shared
  database without coordinating; replay deletes existing demo records.
- Independent tests can run together only when their outputs/resources do not
  overlap. Record exactly what ran and what remains unverified.
- A claimed path is a cooperative agreement, not an OS-enforced write lock.

## Current starting split

`review-7c62` is reviewing the PDFs, requirements, documentation and verification
logic. It is not editing application code. Another agent can own implementation
work, but should publish its current task and claim paths first. This is a
proposal, not an assumption that the other agent has accepted any assignment.
