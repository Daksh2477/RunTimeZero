# Two-agent protocol

Two AI agents work this repo at the same time, on one branch, with no locking
from git. Everything below exists to stop three specific collisions:

1. **Same file edited twice** → rebase conflict, and whoever pushes second loses work.
2. **Same port** → `EADDRINUSE`, the second API dies.
3. **Same database** → one agent runs `npm run replay` (which TRUNCATEs) while
   the other is mid-reconciliation, and the numbers silently go wrong.

Read this file first. Then read `CLAIMS.md` before you touch anything.

---

## Identity

Pick your identity on your first action and keep it for the whole session:

| | |
|---|---|
| **agent-a** | API port **4000**, web port **3000**, database `algacarbon` |
| **agent-b** | API port **4001**, web port **3001**, database `algacarbon_b` |

If `CLAIMS.md` already shows a live claim by one identity and you are not sure
which you are, **take the other one**. Never both be agent-a.

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
1. git pull --rebase --autostash
2. read .agents/CLAIMS.md — is anything you need already claimed?
3. add your row to CLAIMS.md
4. ./scripts/commit.sh "claim: <what>"  &&  ./scripts/push.sh     ← push it NOW
5. do the work
6. ./scripts/commit.sh "<real message>"  &&  ./scripts/push.sh
7. remove your row from CLAIMS.md, append to LOG.md, commit and push
```

Steps 4 and 7 are cheap. Skipping step 4 is how two agents spend an hour
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

5. **Push small and often.** A change you sit on for an hour is a conflict you
   resolve later. Anything that works should be pushed.

6. **These files are shared and will conflict too.** Keep edits to `CLAIMS.md`
   and `LOG.md` to a single row, appended or removed — never reformat or
   reorder them, because a whole-file rewrite conflicts with everything.

7. **Do not run `npm run replay` against the other agent's database.** It
   TRUNCATEs telemetry, observations, harvests and checks. Always confirm your
   `DATABASE_URL` first.

8. **Shared invariants still apply.** `docs/DECISIONS.md` #6 — the engine never
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
