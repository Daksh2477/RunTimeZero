# Roadmap

Vertical slices. Each module ships **backend + frontend + whatever else it
touches**, and is demoable on its own. No module is "done" when the API works —
it is done when someone can see it and use it.

Ordered by how much the demo loses without it.

---

## Where we actually are

Honest assessment from a survey of the code, not from the build log.

**Works end to end:** telemetry ingestion over MQTT, the reconciliation engine,
the fleet console, pond detail, the public verifier, the simulator, the expense
ledger, the physics twin (44 tests), the contracts (17 tests).

**Built but unreachable — no code path leads here:**

| Thing | State | Consequence |
|---|---|---|
| All three contracts | 17 tests pass, **zero call sites in the API** | The entire credits half of the pitch cannot be demonstrated |
| `divergencePattern` | Trained, 92% accuracy, **never called** | The "clever fraud" story is a library function nobody invokes |
| `biomassFromNdci` | Trained, **never called** | `estimate.ts` still uses a placeholder linear fit |
| Copernicus ingestion | Written, untested against the live API | Independent evidence is synthetic |
| Wokwi node | Firmware written, not pointed at a real pond | The knob-turning demo moment does not exist yet |

The first row is the big one. We say "credit the lower bound, mint only that" —
and there is currently no mint.

---

## M1 · Batches and minting

**Closes:** the credits half of the product. Highest priority by a distance.

A verified window currently ends at a `divergence_check` row. It has to become
a batch, an MRV report, and a token.

| Layer | Work |
|---|---|
| Schema | `batches` exists but is never written. Add `mrv_report_cid`, wire `divergence_check_ids`. |
| Backend | `POST /batches` — roll up checks for a site+period, require a durable disposition, generate the MRV report JSON, hash it, call `BatchEvidence.attest()`, then `CarbonCredit.issue()` capped at the attested figure. |
| Chain | Deploy the three contracts to Amoy. Needs a funded throwaway key. |
| Frontend | Batch list on the site page; "create batch" flow that shows what will be minted *before* minting; on-chain status and tx link. |
| Correlates | Verify page gains a token ID and chain link. Pond detail shows which batch a window landed in. Economics page switches from `divergence_checks` to actually-minted tonnes. |

**Demo moment:** press a button, watch a token appear on Polygonscan carrying
the divergence score and the report hash.

---

## M2 · Marketplace and retirement

**Closes:** the buyer side. Without it we mint credits nobody can acquire.

| Layer | Work |
|---|---|
| Backend | `GET /market` (batches with outstanding supply), `POST /market/:batchId/retire` taking a beneficiary name. |
| Chain | `CarbonCredit.retire()` burns and issues the certificate. |
| Frontend | Buyer view: available batches with their evidence quality visible, fractional purchase, retirement form, and the certificate itself as a shareable page. |
| Correlates | Verify page shows retired/outstanding. Fleet shows a site's issued total. |

**Demo moment:** retire 50 kg as "Surat Textiles Pvt Ltd" and land on a
permanent certificate page that names them.

---

## M3 · Divergence pattern detection, wired

**Closes:** the gap between what we claim the ML does and what it does.

The hard rule catches impossible claims. A careful operator overstating 8%
every window never approaches the ceiling. That is the whole argument for the
classifier — and right now it never runs.

| Layer | Work |
|---|---|
| Schema | Add `pattern` and `pattern_confidence` to `divergence_checks`. |
| Backend | Engine pulls the last 12 divergences, calls `divergencePattern`, stores the result. It may influence the **verdict** only, never `creditableCo2Kg`. |
| Frontend | Pond detail: a sparkline of divergence across windows with the pattern labelled. Fleet: a marker on sites showing `systematic`. |
| Correlates | Verify page explains *why* a pattern was flagged. |

**Demo moment:** a pond that passes every individual check, flagged on the run.

---

## M4 · Forecast and the advisory it feeds

**Closes:** goal #1 properly. Advisories currently react; they should predict.

| Layer | Work |
|---|---|
| Backend | `GET /fleet/pond/:id/forecast` — the ceiling model run forward on Open-Meteo (free, no key), corrected by `yield_residual`. |
| Frontend | 7-day forecast chart on pond detail with the harvest window marked. |
| Correlates | Advisory's `forecastYieldKg` stops being a rough division and becomes real. Crash warnings gain "conditions worsen Thursday". |

---

## M5 · Real evidence

**Closes:** the honesty gap — our independent channel is currently synthetic.

| Layer | Work |
|---|---|
| Backend | Copernicus credentials, run `ingest:sentinel` against a real coordinate, wire `biomassFromNdci` into `estimate.ts` in place of the placeholder fit. |
| Frontend | Show the actual Sentinel scene ID and pass date on the verify page. |
| Correlates | **Every credited figure changes.** Re-reconcile after. Band widths shift to the calibrated model, floored at the literature 2.4×. |

---

## M6 · The physical node

**Closes:** the demo moment judges remember.

| Layer | Work |
|---|---|
| Firmware | Point `POND_ID` at a real seeded pond. |
| Backend | Nothing — the subscriber already accepts it. |
| Frontend | "Live" indicator when a reading arrived in the last 60s; the reading updating on screen. |

**Demo moment:** drag a potentiometer in Wokwi, watch the dashboard move.

---

## M7 · Landing and first impression

Right now `/` redirects to `/console`, which assumes the visitor is an
operator. A judge arriving cold needs the argument in ten seconds.

| Layer | Work |
|---|---|
| Frontend | A real landing page: the problem, the `min()` rule, and three routes in — operator, verifier, simulator. |
| Correlates | Navigation across all four surfaces. |

---

## Working rules for each module

1. **Backend and frontend land together.** A merged API with no UI is not a
   finished module; it is a hidden feature, which is how we ended up with three
   trained models nobody can see.
2. **Update the correlated surfaces in the same pass.** Every module above has
   a "correlates" row for a reason — a change that leaves another page showing
   stale numbers is worse than no change.
3. **Re-run the demo path after each module.** Seed → replay → reconcile →
   console → verify. If any step breaks, fix it before starting the next module.
4. **Docs track the code.** If a module changes what gets credited, `README.md`
   and `HOW-IT-WORKS.md` change in the same commit. We have already been caught
   once with docs promising behaviour the code did not have.

## Order, and what to cut

M1 and M2 are the difference between "we built a verification engine" and "we
built a carbon credit platform". M3 is what makes the AI claim real. M6 is the
cheapest memorable moment we have.

If time runs out, cut M5 (synthetic evidence is defensible if we say so) and M4
before touching M1–M3.
