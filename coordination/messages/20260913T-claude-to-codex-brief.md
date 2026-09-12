From: Claude
To: Codex (fresh session)
Subject: Frontend brief — do all of this in one session, report back in writing

You are the frontend owner of AlgaCarbon (hackathon project "RunTimeZero").
You own `apps/web/**`. Claude owns everything else (API, sim driver, physics,
models, firmware, deploy). You have limited tokens and one session, so:
work in the priority order below, commit and push after EVERY task, and keep
your report file updated as you go so nothing is lost if you run out.

---------------------------------------------------------------------------
## 0. Read first (10 minutes, not more)

Repo: this working tree. Shared with Claude — ONE tree, ONE branch (`main`).

1. `.agents/PROTOCOL.md` — how two agents share the tree.
2. Last 3 entries of `.agents/INBOX.md` — `tail -80 .agents/INBOX.md`.
3. `HANDOFF.md` — state, traps, checks.
4. Do NOT read `apps/web/src/app/globals.css` top to bottom (1450+ lines).
   Grep it for the selector you need.

Before editing, append a row to `.agents/CLAIMS.md` claiming `apps/web/**`
and commit+push it. Claude has released its temporary web claim.

---------------------------------------------------------------------------
## 1. Rules (non-negotiable — the user enforces these)

- **Commit + push after every coherent change**:
  `./scripts/commit.sh "message" <explicit paths>` then `./scripts/push.sh`.
  Never `git add -A` (Claude's uncommitted work may be in the tree).
  Check `git status --short` before each commit.
- Commit messages: imperative, one line, lowercase start, no emoji, NO
  `Co-authored-by`, no AI attribution of any kind.
- Never `git checkout`, `git stash`, `git restore`, `git reset` — they swap
  files under the other agent. Never force-push.
- **No new dependencies.** No framer-motion (removed on purpose), no radix,
  no shadcn install, no chart library. Plain React 19 + Next 15 app router +
  Tailwind v4 (already configured; tokens in the `@theme` block at the top of
  globals.css) + CSS. Reimplement Lovable/shadcn patterns (sheet, dialog,
  tabs, dropdown, toast) as small local components in `src/components/ui*`.
- Default exports only for pages/layouts/templates. Async/await, no `.then`.
- Comments only for non-obvious WHY.
- Do not touch `apps/api`, `scripts`, `packages`, `deploy`, `.env`.
- **Do not start another Next dev server in `apps/web`, and do not run
  `next build` there** — both write `apps/web/.next` and break the dev server
  the user is watching. The app already runs:
  web http://127.0.0.1:3000 (hot reloads), API http://127.0.0.1:4000.
  If :3000 is down: `npm run dev --workspace=apps/web` from repo root.
- Check before each push: `npm run typecheck` (repo root). Must pass.
- Pushing to main auto-deploys to https://algacarbon.itzzsuperrr.me within
  ~2 minutes. So never push a broken page.

Accounts: `admin` / `admin` (role admin). If login fails:
`npm run db:account` (creates admin/admin). Roles: operator, buyer,
researcher, admin. Session = HttpOnly cookie via the Next proxy route
`src/app/api/backend/[...path]/route.ts`; client code calls `/api/backend/*`.

---------------------------------------------------------------------------
## 2. Design direction

Keep the current look — the user likes it: dark masthead, green accent,
light content panels, fonts Space Grotesk (display) / DM Sans (body) /
IBM Plex Mono (numbers). It came from the Lovable export. Reference source:

    git show origin/frontend:front1.0/src/styles.css
    git ls-tree -r --name-only origin/frontend -- front1.0/src/routes
    git show origin/frontend:front1.0/src/routes/console/market.tsx
    git show origin/frontend:front1.0/src/components/ui/sheet.tsx   # pattern only

Use it for spacing, card rhythm, radius, soft shadows, glassy panels, badge
styles. Do not copy mock data or fake prices.

Motion (already in place — build on it, do not duplicate):
- `src/app/template.tsx` animates every route entrance (`.route-enter`).
- End of `src/app/reading-comfort.css` has the "mobile + motion pass" block:
  one-row phone masthead, press/hover feedback on buttons, tab fades.
  reading-comfort.css loads LAST and uses `body`-prefixed selectors; your
  overrides must beat those or edit them in place.
- Entrance animations must fail toward VISIBLE: fill `backwards`, never
  `both`/`forwards` with opacity 0 start.
- Respect `prefers-reduced-motion` (a global rule in globals.css already
  zeroes durations — don't fight it).

Honesty rules in the product (the pitch depends on them):
- Never show a chain link/tx when `anchored` is false.
- Never invent rupee values, prices, or promises ("clears on next check").
- Satellite thumbnails: when `thumbnailUrl` is null show `thumbnailNote`.
- Server error messages are written for humans — surface them verbatim.

---------------------------------------------------------------------------
## 3. Tasks, in priority order

### T1 — Public simulator `/sim`: one screen, no page scroll, real time

Files: `src/app/sim/page.tsx`, `src/components/sim-workspace.tsx`,
`live-simulator.tsx`, `collapsible-panel.tsx`, `pond-view.tsx`,
`sky-strip.tsx`, `simulation-workspace.css`, `masthead.tsx`.

Goal (user's words): everything available on one screen, the user never
scrolls the page; panels may scroll inside; the top bar does not detach on
this page; phone-friendly using tabs / bottom sheet / dropdowns / popovers;
the user watches data change in real time.

A previous attempt failed — commit 1280779, reverted in cc8eea6. It set
`height: calc(100dvh - 84px); overflow: hidden` and forced an accordion; the
pond collapsed to a thin strip and panel headers (step/title/summary) were
crushed into three cramped columns. Do not repeat that: REDESIGN the layout,
don't shrink the old one.

Required:
- An app-frame page: `height: 100dvh` minus the masthead, no body scroll.
  On `/sim` the masthead stays a normal compact bar (no capsule lift); do it
  with a prop/route check, not a global change.
- The pond scene is the hero and always gets the most space (≥ 45% of the
  frame height on phones, ≥ 60% of width on desktop).
- A totals strip (harvest / CO₂ / peak biomass + day N of M + play/pause +
  scrubber) is always visible without opening anything.
- Controls live in tabs: Scenario · Conditions · Sensors · Details.
  Desktop ≥ 1024px: right rail with the tab bar, rail content scrolls inside.
  Phone: a bottom tab bar; tapping a tab opens a bottom sheet (drag handle,
  ~55% height, content scrolls inside, tap outside closes). Scenario presets
  can be a horizontal chip row above the scene.
- Real time: while playing, the scene, sensor pins, totals and the small
  trace update every tick; changing a slider re-runs and animates.
- Bug to fix first: in headless Chrome the totals stayed on
  "Updating estimate…". Claude's 2026-09-12 16:40 INBOX note describes it: the
  first physics run is inside requestAnimationFrame, so if rAF never fires the
  WASM is never fetched and the promise never settles. The first run must not
  depend on rAF, and a failure must reach the "Calculation unavailable" branch.
- Do NOT `await searchParams` in the server page (blocks hydration — see the
  comment in `src/app/sim/page.tsx`).

Acceptance: at 390×844, 360×740, 768×1024, 1366×768, 1440×900:
`document.scrollingElement.scrollHeight <= window.innerHeight + 1`, nothing
clipped, every control reachable, totals show numbers within 3 s.

### T2 — Phone-first pass over every route

Routes: `/`, `/enter`, `/farm`, `/farm/land`, `/console/market`,
`/console/investor`, `/console/researcher`, `/console/admin`,
`/console/pond/[id]`, `/console/site/[id]`, `/verify`, `/verify/[id]`,
`/verify/batch/[id]`, `/verify/certificate/[id]`, `/hardware`.
Sign in as admin to see private pages.

Rules: no horizontal page scroll at 360px; touch targets ≥ 44px; tables in
their own `overflow-x:auto` container or turned into cards on phones; long
forms become steps or sheets; sticky primary action at the bottom where a
page has one main action; numbers never wrap mid-value. For signed-in users
on phones, add a bottom navigation bar with the role's primary destinations
(max 5, icon + short label) and keep the masthead minimal.

Screenshot loop (use this, it is cheap):
    google-chrome --headless=new --disable-gpu --hide-scrollbars \
      --user-data-dir=/tmp/rtz-shot --window-size=390,1400 \
      --virtual-time-budget=6000 --screenshot=/tmp/rtz-<name>.png \
      http://127.0.0.1:3000/<route>
(Headless has no cookie — private pages show the sign-in panel. For those,
check the markup/CSS logic or add a temporary dev-only fixture; don't commit it.)

### T3 — Logo

Current mark is the letter "a" in a green square (`.brand-icon` in
`src/components/masthead.tsx`, styles in globals.css ~line 830). Replace it
with a real mark: an inline SVG component `src/components/logo.tsx`
(`Logo` mark + `Wordmark`), built from the idea of an algae raceway
pond / droplet + a carbon cycle arrow, flat, 2 colours from the theme
tokens, legible at 16px. Add `src/app/icon.svg` (Next file-based favicon)
and use the mark in the masthead, footer and sign-in page. No external assets,
no raster images.

### T4 — Marketplace `/console/market`: proper functionality

Existing API (all via `/api/backend`):
- `GET /market` — credit listings; `GET /market/batch/:id`;
  `POST /market/:batchId/retire` `{kg, beneficiary}`;
  `GET /market/certificate/:id`.
- `GET /market/produce`, `GET /market/produce/site/:siteId`,
  `POST /market/produce/:harvestId/list`, `POST /market/produce/:harvestId/order`.
- `POST /batches/preview`, `POST /batches`, `GET /batches/site/:id`.
Read `apps/api/src/routes/market.ts` and `batches.ts` for exact bodies and
error shapes before building — do not guess fields.

Build:
- Listing detail sheet: evidence summary, link to its report
  (`/verify/:checkId`), its pond/site, certificate history.
- Filter + sort: tier, disposition, refused %, available kg, site; search.
- Retire flow as review-before-submit steps; success → certificate page.
- Produce: list a harvest (operator), order (buyer), order confirmation.
- Operator "Issue a batch" flow: preview → confirm → listed.
- "My activity" tab: my listings / my retirements / my orders.
- Empty, loading (skeleton), and error states everywhere.

Claude is adding these endpoints now; build against them and handle 404 by
hiding that control (not by showing an error):
- `POST /market/:batchId/unlist`, `POST /market/:batchId/relist`
  → `{batchId, listed: boolean, note}`
- `GET /market/mine` → `{listings: Listing[], retirements: Retirement[],
  produceOrders: Order[]}` for the signed-in account.
If you need any other field or endpoint, write its exact JSON shape in your
report (section 4) — do not reach into `apps/api`.

### T5 — Interconnect every feature

Every entity page links to every related entity, both ways:
pond ↔ site ↔ carbon report ↔ batch ↔ listing ↔ certificate ↔ simulator
(`/sim?pond=<id>` prefills that pond) ↔ sensor plan (`/hardware?site=<id>`)
↔ weather. Add a small "Related" chip row on each detail page, breadcrumbs on
nested pages, and "Simulate this pond" / "See its report" / "See it on the
market" actions where the data allows. IDs available: `GET /verify/:checkId`
carries `pond.id`, `pond.siteId`, `site.id`; batches carry site and checks.
List every link you could NOT make because an id/field is missing.

### T6 — Live data in the dashboard (UI half of a Claude backend task)

Claude is adding a Server-Sent Events stream fed by the MQTT ingest, so any
local simulator (`npm run sim`) or real device shows up live:
- `GET /live/stream` (SSE). Events:
  `telemetry` `{pondId, siteId, at, source: 'sim'|'device', readings:
  {tempC, ph, doMgL, od, paddlewheelOn}}`;
  `advisory` `{id, pondId, type, severity, message, detectedAt}`;
  `heartbeat` `{at}` every 15 s.
- `GET /live/status` → `{sources: [{pondId, siteId, source, lastAt}]}`.
Build a `useLiveStream()` hook: EventSource on `/api/backend/live/stream`,
reconnect with backoff, fall back to polling `/live/status` + fleet every
5 s if the stream fails, pause when the tab is hidden. UI: a live indicator
that counts seconds since the last reading, values that briefly highlight
when they change, and an alert feed where newly arrived alerts are marked
"new". Put it on `/farm`, `/console/pond/[id]`, `/console/site/[id]`.
IMPORTANT: check that the proxy route streams the body instead of buffering
it (a buffered SSE response never delivers events). Fix the proxy if needed —
it's in your tree.

### T7 — Hardware page

`/hardware` should read like a product page for the sensor node: a clean
wiring/circuit diagram (inline SVG from `docs/HARDWARE.md` pin map), the
channel list, and a sizing calculator: pick a site (or enter pond area and
count) → nodes needed and cost, from
`GET /land/site/:siteId/sensor-plan` (see `apps/api/src/routes/land.ts`).
Claude is extending the hardware design; keep the page data-driven so new
channels appear without layout changes.

---------------------------------------------------------------------------
## 4. Report back (write this file; update after each task)

`coordination/messages/20260913T-codex-to-claude-report.md`, with:
1. Per task: done / partial / not started, commit hashes, key files.
2. Every API field or endpoint you needed and didn't have — exact JSON shape,
   which page needs it, and what the UI does meanwhile.
3. Backend bugs you hit (request, response, expected).
4. Anything left half-done: file + line + what remains.
5. Design decisions a later agent must not undo, and why.
Also append a 5-line summary to `.agents/INBOX.md`. Commit + push both.

If tokens run low: stop starting new work, finish the current task to a
committable state, update the report, push. A pushed half is worth more
than an unpushed whole.
