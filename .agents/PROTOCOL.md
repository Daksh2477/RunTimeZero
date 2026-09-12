# Two-agent protocol

**We share one working tree.** Not two clones — the same files on the same
disk. An earlier draft of this document assumed separate checkouts and was
wrong about the most important thing, so read this section even if you have read
it before.

What that means in practice:

- The other agent's **uncommitted edits are in your files right now.** `git
  status --short` will show changes you did not make.
- `git add -A` will commit their half-finished work under your message. This is
  why `scripts/commit.sh` now **requires explicit paths** and refuses to run
  without them.
- Two processes cannot both bind port 4000, and `npm run replay` TRUNCATEs four
  tables regardless of who started it.
- Git gives you no protection at all here. Claims in `CLAIMS.md` are the only
  thing keeping you apart, and they are advisory — they work because both
  agents read them, not because anything enforces them.

Everything below exists to stop four specific collisions:

1. **Same file edited twice** → you overwrite each other's work in place, with
   no conflict marker to warn you.
2. **`git add -A`** → you commit work that is not yours and not finished.
3. **Same port** → `EADDRINUSE`, the second API dies.
4. **Same database** → one agent runs `npm run replay` while the other is
   mid-reconciliation, and the numbers silently go wrong.

Read this file first. Then read `CLAIMS.md` before you touch anything.

---

## Ownership

Split by directory rather than by negotiation. This replaces most of the
claim-by-claim dance below: if the work is inside your half, just do it.

| | Owns | Ports |
|---|---|---|
| **Codex** (agent-b) | `apps/web/**` — all UI, UX, components, styling, client state | web **3001** |
| **Claude** (agent-a) | Everything else: `apps/api`, `packages/*`, `apps/contracts`, `apps/firmware`, `scripts/`, `docs/`, schema, deploy | API **4000**, web **3000** |

**The API response shape is the contract between us.** Codex builds against what
the endpoints return; Claude does not change a response shape without saying so
in `INBOX.md` first, because that breaks the frontend silently — a missing field
renders as `undefined`, not as an error.

If Codex needs a field that does not exist, ask in `INBOX.md` rather than
reaching into `apps/api`. If Claude needs to remove or rename a field, say so
before doing it.

`CLAIMS.md` is still used for anything that crosses the boundary — a schema
change the UI depends on, a shared type, `README.md`.

### Setting up as agent-b

```bash
createdb algacarbon_b
export DATABASE_URL="postgresql:///algacarbon_b?host=/var/run/postgresql"
export API_PORT=4001
export NEXT_PUBLIC_API_URL=http://localhost:4001
npm run db:setup && npm run db:seed && npm run replay
npm run api                       # binds 4001
npx next dev -p 3001 --dir apps/web
```

Both databases hold the same seeded fixtures, so results are comparable.

---

## The loop

**A claim is only real once it is pushed.** A local claim is invisible to the
other agent, so two agents can both "claim" the same file and only discover it
at rebase. Push the claim before you start work, not after.

```
1. git fetch  (no pull --autostash: stash moves the other agent's edits)
2. git status --short          ← whose uncommitted work is already here?
3. read .agents/CLAIMS.md — is anything you need already claimed?
4. add your row to CLAIMS.md
5. ./scripts/commit.sh "claim: <what>" .agents/CLAIMS.md && ./scripts/push.sh
6. do the work
7. ./scripts/commit.sh "<message>" <your paths only> && ./scripts/push.sh
8. remove your row from CLAIMS.md, append to LOG.md, commit and push
```

Step 2 is new and it matters most. If `git status` shows modified files you did
not touch, the other agent is mid-edit — leave those files alone entirely, and
never stage them.

Steps 5 and 8 are cheap. Skipping step 5 is how two agents spend an hour
building the same page.

---

## Rules

1. **Never edit a file another agent has claimed.** Not "just a small fix".
   Write what you wanted into `INBOX.md` and carry on with something else.

2. **Claim directories, not individual files**, when the work spans several —
   it is more honest about what you will actually touch.

3. **If a claim looks stale** (timestamp over ~45 minutes old and the work is
   clearly not in progress), note it in `INBOX.md`, wait one pull cycle, then
   take it. Do not silently steal a claim.

4. **Never `git push --force`.** If a rebase conflicts, stop and resolve it
   properly. Force-pushing here destroys the other agent's commits.

5. **Never stage a file you did not edit.** Run `git status --short` before
   every commit and stage by explicit path. `git add -A` and `git add .` are
   both banned in this tree.

6. **Never `git checkout`, `git restore` or `git stash` broadly.** Those discard
   uncommitted work, and in a shared tree the work you discard may not be
   yours.

7. **Push small and often.** A change you sit on for an hour is a conflict you
   resolve later. Anything that works should be pushed.

8. **These files are shared and will conflict too.** Keep edits to `CLAIMS.md`
   and `LOG.md` to a single row, appended or removed — never reformat or
   reorder them, because a whole-file rewrite conflicts with everything.

9. **Do not run `npm run replay` against the other agent's database.** It
   TRUNCATEs telemetry, observations, harvests and checks. Always confirm your
   `DATABASE_URL` first.

10. **Shared invariants still apply.** `docs/DECISIONS.md` #6 — the engine never
   sees the simulator's ground truth — is not negotiable by either agent. If you
   believe a decision is wrong, write it in `INBOX.md`; do not just change it.

---

## Files that are hot

These get touched by almost any task, so claim them explicitly and hold the
claim for as short a time as possible:

| File | Why it is contested |
|---|---|
| `packages/types/src/*` | Everything imports it |
| `apps/api/src/server.ts` | Every new route edits it |
| `apps/api/src/db/client.ts` | Every new query lands here |
| `apps/api/src/db/schema.sql` | Migrations and new tables |
| `README.md` | Both of us update the status table |
| `package.json` | New scripts |

For `server.ts` specifically: add your route import and `app.use` line, push
immediately, then do the rest of the work. Holding it for an hour blocks the
other agent completely.

---

## When you disagree

Write it in `INBOX.md` with your reasoning and carry on with other work. Do not
revert the other agent's code to your preference. The human decides.

If you find a genuine bug in the other agent's work, that is different: note it
in `INBOX.md`, and fix it only if it is blocking you — with a comment in the
commit message saying what you changed and why.
