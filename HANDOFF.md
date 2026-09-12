# Handoff

For an agent picking this up cold. Read this, then `docs/RUNNING.md` to get it
booted and `docs/ARCHITECTURE.md` for how the pieces fit. Everything below was
true at commit `bfbb5fd`, 13 Sep 2026.

Owner: Raj (`Mahit-Shah06`). Hackathon deadline. Be brief with him, answer
first, don't restate his code back at him.

---

## Read this before you touch anything

**Two agents share this one working tree** — this one and "Codex". The
protocol is in `.agents/PROTOCOL.md`; claims go in `.agents/CLAIMS.md`,
messages in `.agents/INBOX.md`. Check both before editing `apps/web`.

**Commit and push after every coherent change.** Not at the end of a session.
The user has asked for this explicitly and more than once. Use explicit paths —
never `git add -A`, because the other agent's half-finished work is usually
sitting in the tree and you will commit it by accident. (That has happened
twice. Both times it broke CI.)

**Commit messages**: imperative, one line, no emoji, no `Co-authored-by`, no
Claude attribution. The user has asked for this specifically.

---

## The state of the tree right now, and why the site looks broken

`git status` is not clean, and that is the single most important thing to know.

Codex has an **uncommitted, in-progress auth rework** sitting in `apps/web`:

| File | State |
|---|---|
| `src/lib/auth-contract.ts` | untracked — roles, ACCESS map, `isPublicPath` |
| `src/components/account-gate.tsx` | untracked — wraps every page, gates private ones |
| `src/app/enter/auth.css` | untracked |
| `src/lib/session.ts` | modified — `useRole` now reads `/auth/me` instead of localStorage |
| `src/app/layout.tsx` | modified — wraps children in `<AccountGate>` |
| `src/app/enter/page.tsx` | modified — real login/register form |
| `src/lib/api.ts`, `market-api.ts`, a few pages | modified |

This is why the app feels dead when you are signed out: everything except
`/`, `/enter`, `/sim`, `/hardware`, `/console/market` and `/verify` becomes a
sign-in panel. That is the intended design, but it landed half-finished.

**Every commit in git history is free of this.** So "go back to a good commit"
is the wrong instinct — the history is fine, the working tree is not:

```bash
git stash push -u -m "codex auth wip"   # site returns to the last commit
git stash pop                            # put it back, nothing lost
```

Two bugs in it were already fixed (one committed, one not):

- `navigation.tsx` early-returned an empty bar while the account was being
  read, which took the **Sign in link off every page**. Fixed and committed as
  `01cf701`.
- `account-gate.tsx` replaced the whole page with a holding screen for the
  length of the `/auth/me` round trip, so every navigation looked like a dead
  site. Fixed in the tree; **not committed**, because the file is Codex's.

Auth itself works. Verified end to end: `POST /api/backend/auth/login` with
`admin` / `admin` → 200 and an httpOnly cookie; `/auth/me` → role, landingPath,
scope; `/farm` then server-renders 14 pond cards.

---

## Known broken

1. **nginx shadows the session proxy on prod.** `/etc/nginx/sites-available/algacarbon`
   has `location /api/ { proxy_pass http://127.0.0.1:4300/; }`, which swallows
   `/api/backend/*` — the Next route that sets the auth cookie. Auth cannot work
   on the VM until a `location /api/backend/` block pointing at `:3300` is added
   **above** it (nginx takes the longest prefix). Local dev is unaffected.
2. **`AUTH_SECRET` is missing from the VM's `.env`**, so the API generates a
   random one at boot and every token dies on restart. `COPERNICUS_CLIENT_ID`
   and `COPERNICUS_CLIENT_SECRET` are missing too, so satellite thumbnails 503
   on prod but work locally.
3. **`AUTH_ENFORCE_READS=false`** — the API serves `/fleet` to anyone. So a
   signed-out visitor on `/farm` gets the real ponds server-rendered for an
   instant before the client gate swaps in the sign-in panel. The honest fix is
   to read the session cookie server-side instead of gating in a client
   component.
4. The masthead capsule is not detaching on scroll (`is-lifted`, see
   `components/masthead.tsx` and the `.masthead` rules in `globals.css`).
   Reported by the user, not yet diagnosed.

The `errorMissingColumn` / `prerender-manifest.json` errors in `pm2 logs` are
**stale**. The columns exist and the build is present; those lines predate the
last deploy. Check timestamps before chasing them.

---

## Not built yet

- **Marketplace add/remove listings.** Issuing a batch currently *is* listing
  it; there is no unlist. Needs a `batches.listed_at` column plus
  `POST /market/:batchId/list` and UI. The user asked for this and it is the
  oldest open item.
- **Research preview** — a sample of a dataset before a licence request, off
  `GET /research/catalogue`.
- **API-side scope enforcement** — an operator can read any site's data.
  `/auth/me` returns `scope` but nothing enforces it. Also `permissions[]`.
- **Custodial ledger** — one platform wallet plus an internal kg ledger shown
  in INR. Recommended, never confirmed.
- **Credit vintage / expiry** — undecided. Proposed 2 years from `period_end`.
- The teammate's ATP3 work on `origin/real-atp3-ml` should be cherry-picked
  onto main's 21-feature loader, not merged.
- GitHub "About" needs the site link. Needs Daksh — repo admin, not us.

---

## Things that will bite you

- **Node 22 `--experimental-strip-types`.** No parameter properties, no enums,
  no decorators. `constructor(readonly status: number)` type-checks and then
  dies at boot. Use a plain field.
- **scrypt** with `N=32768` needs an explicit `maxmem` or it throws "memory
  limit exceeded".
- **No ORM.** Raw SQL, explicit column lists, never `SELECT *`.
- **`schema.sql` must stay idempotent.** New columns go in the additive
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS` block at the bottom, *not* inside
  `CREATE TABLE IF NOT EXISTS` — an existing database never re-runs the create,
  which is how prod ended up missing `retired_at` for a day.
- **Deploying**: `~/algacarbon/deploy/deploy.sh --force`. Do not hand-roll
  `npm ci` + `pm2 restart`; it skips `next build` and 502s the site.
- **Never `pkill -f sim-driver`** — the pattern matches your own shell. Use
  `sim-[d]river`.
- **No new dependencies** without asking. Both of the user's projects are
  deliberately dependency-light.
- Don't edit files directly on the VM. Change locally, push, deploy.

## Checks before you push

```bash
npm run typecheck     # tsc, web tsc, and the 21-feature contract across 4 files
npm run test:api      # 6 tests
npm run build:web     # catches the imports typecheck misses
```

CI has gone red twice from committing a file whose import was still untracked.
`build:web` is what catches that.
