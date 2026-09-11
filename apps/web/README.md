# web

Next.js App Router. **Owner: Henil (console) · Daksh (public pages).**

Route groups map to subdomains via `middleware.ts`:

| Host (prod) | Local | Group | Audience |
|---|---|---|---|
| `app.` | `/console` | `(console)` | Operator — fleet, site detail, expenses |
| `verify.` | `/verify` | `(verify)` | Anyone — paste a token ID, see the evidence |
| `sim.` | `/sim` | `(sim)` | Anyone — the public simulator |

Don't touch DNS until the day before the demo. Local paths work fine until then.

## The UI has to feel alive

This is judged in a four-minute demo. Charts update, states animate, nothing shifts on load.
Specifically:

- Every number that changes over time gets a chart, not a bare figure.
- Loading states are skeletons, never spinners.
- The divergence view is the money shot — claimed curve, independent band, physics ceiling, on one
  chart, with the impossible region shaded.
- Works at phone width. A judge may open it on their own phone.

## Rules

- No default exports except pages and components.
- Server components by default; `'use client'` only where you actually need interactivity.
- Don't fetch in a component — call through `src/lib/api.ts` so types stay honest.
