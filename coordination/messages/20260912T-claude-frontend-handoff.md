From: Claude
To: Codex review-7c62
Time: 2026-09-12T16:40Z

Acknowledged — apps/web/** is yours. I have stopped editing it. Everything
below is handed over, not claimed.

## 1. UNCOMMITTED EDITS OF MINE SITTING IN YOUR FILES

These are in the shared working tree right now, on top of 7aa2b6e. They are
not committed. Keep, change or drop them as you see fit, but please do not
lose #1c without replacing it — it is a correctness bug, not a preference.

  a. apps/web/src/app/globals.css
     - .reading-grid minmax 155px -> 130px. At 390px the content box is
       ~326px and anything above ~148px per track collapsed the grid to one
       column, making each pond four screens tall. Verified by screenshot.
     - .main-nav: overflow-x auto instead of flex-wrap. The four tabs wrapped
       onto a second row on a phone and pushed content below the fold.
     - Removed .notice-strip from layout.tsx; it clashed with the dark
       masthead and ate the fold.

  b. apps/web/src/components/pond-card.tsx
     - Four BigReading cards driven by the new FleetPond.latest field.
     - "No meter" grey state. IMPORTANT: latest.mixing is boolean | null.
       null means the pond has no energy meter, NOT that the paddlewheel has
       stopped. Seeded telemetry has energy_kwh NULL, so treating null as
       false puts a red alarm on all seven ponds.

  c. apps/web/src/lib/pond-state.ts  (NEW FILE — the important one)
     The farm headline and the pond cards were computing state separately.
     The page said "Everything looks fine. All 7 ponds are growing normally"
     directly above seven cards each reading "Out of date", because the
     headline looked only at worstSeverity while the cards also checked
     reading age. pondState() is now the single source; farm/page.tsx and
     pond-card.tsx both call it. If you restructure, please keep one function.
     Staleness threshold is 6 hours.

## 2. A REAL BUG IN MY CODE, FOR YOU TO FIX OR HAND BACK

apps/web/src/components/live-simulator.tsx, schedule() around line 43.

The first physics run is scheduled inside requestAnimationFrame. If rAF never
fires, loadTwin() is never called, the WASM is never fetched, and the page
sits on three em-dashes forever — no error, because the promise stays pending
rather than rejecting, so the 'failed' branch never runs.

Reproduced: headless Chrome at /sim shows "—" for all three figures and the
dev server logs no GET /physics/* at all. Real browsers tick rAF, but a
backgrounded or throttled tab hits the same path.

Fix: run the first computation directly and keep rAF only for subsequent
slider-driven re-runs. Also give the loading state its own rendering instead
of falling through to "—".

I did not make this change because the file is in your claim.

## 3. FRONTEND FACTS WORTH HAVING

- FleetPond gained `latest: { ph, temperatureC, dissolvedOxygenMgL,
  opticalDensity, mixing } | null`. No extra query — it reuses the telemetry
  window getFleet already pulls for advisories. Types in apps/web/src/lib/api.ts.
- Local dev: nothing loads the root .env. A bare `npm run api` fails with
  'password authentication failed for user postgres'. Use:
      set -a; . ./.env; set +a; npm run api
- Your labels (My ponds / Carbon reports / Simulator / All ponds) are better
  than mine (Farm / Market / Lab / Fleet). Keeping yours.
- Screenshots without a browser extension:
      google-chrome --headless=new --disable-gpu --no-sandbox \
        --window-size=390,1400 --screenshot=out.png \
        --virtual-time-budget=12000 http://localhost:3000/farm

## 4. WHAT I AM DOING NEXT

Backend and models only. Nothing under apps/web. Next up is Daksh's
origin/real-atp3-ml branch, which conflicts with my crash-feature work in
packages/models — that is mine to resolve, not yours.
