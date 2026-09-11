# Decisions

Why things are the way they are. Written down so nobody re-argues a settled point at 3am, and so we
can answer "why did you do it like that?" without inventing a reason on the spot.

---

## 1. Build verification, not monitoring

**Context.** The industry's failure is not measurement technology. Roughly 23% of credits retired in
the voluntary market in 2024 were judged unlikely to deliver; across a meta-analysis of nearly a
billion tonnes, fewer than 16% of credits from investigated projects represented real reductions.

**The decisive observation:** *no* major carbon fraud involved a tampered registry. The records were
accurate. The inputs were false.

**Decision.** A prettier dashboard over the same self-reported number changes nothing. We build the
thing that checks the number.

---

## 2. Every sensor reading is an assertion

**Context.** We have no hardware. We initially treated that as disqualifying.

**Decision.** Treat all telemetry as an unverified claim — including a SCADA feed, including a
calibrated probe, including our own simulator. Provenance is recorded in `telemetry.source` but does
**not** raise trust.

**Consequence.** Not having sensors stopped being a weakness. Our value was never going to be in the
instrument.

---

## 3. Imagery disagrees, it never certifies

**Context.** We planned to derive carbon straight from satellite imagery. Then we checked: NDCI needs
Sentinel-2 band B5 at 20 m, so a 100 m × 10 m raceway is half a pixel wide, and validated NDCI
carries a mean absolute error factor near 2.4.

**Decision.** Imagery is a **divergence detector with error bounds**, never a certified quantity. We
compare intervals, not numbers.

**Why this rescued the project.** Detecting that two numbers disagree is a far weaker requirement
than measuring either one exactly — and it is the requirement the fraud problem actually poses.

**Consequence.** Ponds narrower than ~40 m get a different independent channel (drone, weighbridge),
which is where the tier system in `ARCHITECTURE.md` comes from.

---

## 4. We do not measure CO₂ uptake

**Context.** We assumed uptake couldn't be measured without instruments we lack. It can —
inlet/outlet gas analysis is standard practice. But that instrument belongs to the operator.

**Decision.** Uptake enters the system as a reported figure. That is precisely the quantity we exist
to cross-examine, so measuring it ourselves would miss the point even if we could.

---

## 5. Credit the lower bound, not the claim

**Decision.**

```
mintable = min(claimedUptake, independentEstimate)
require(claimedUptake <= physicsCeiling)
require(disposition in {buried, biochar, bioplastic})
```

**Why this and not an anomaly score.** A detector tells you a lie happened. This makes lying
**pointless** — inflating a claim can never increase what is minted, so there is no payoff to
overstating in the first place.

**Why the ceiling matters separately.** It uses no fitted model and no training data, only pond
geometry, light and temperature. A claim above it isn't suspicious, it's impossible — and that's an
argument nobody can dispute by attacking our model, because there isn't one.

**Why the disposition clause.** Growing algae is not sequestration. If the biomass is eaten, burned
or left to decompose, the carbon returns within days. Without this clause we'd be certifying
utilisation and calling it removal, which is the most common error in this field.

---

## 6. The engine must never see ground truth

**This is the invariant the whole demo rests on.**

Our simulator generates a pond's true state, then derives a telemetry stream from it (with operator
bias injected). The reconciliation engine receives **only** the claim, the independent estimate and
the ceiling. It never receives the true value.

If ground truth ever leaks into the engine — via a shared object, a debug field, a convenience
join — then "detection" is just the simulator reporting a number it already knew, and the demo
proves nothing. A judge who spots it ends our pitch.

**Enforcement.** `packages/types/src/reconcile.ts` has no import path to the simulator's internal
state, and it must stay that way. If you need a value in the engine, it has to arrive through
`DivergenceCheck` inputs.

---

## 7. Rust only for physics, compiled to WASM

**Context.** Rust is the better language for deterministic math. It is the worse language for three
teammates learning a stack under time pressure, and the frontend must be TypeScript regardless.

**Decision.** `packages/physics` is a Rust crate compiled to WASM. Everything else is TypeScript.

**The win.** One implementation of the twin runs identically on the server and in the browser, so
the public simulator and the verification engine can never drift apart.

**Abort condition.** If `wasm-pack build` isn't producing an importable module within **90 minutes**,
port the physics to TypeScript. It's ~200 lines of arithmetic. Written down here so nobody has to
make that call under pressure.

---

## 8. The chain is a settlement layer, not a trust layer

**Context.** Immutability does not create trust. A chain records a lie exactly as faithfully as a
truth — see decision 1.

**Decision.** Put credits on Polygon anyway, for three things a private database cannot give a
stranger:

- a credit that cannot be sold twice (burn-to-retire, non-transferable certificate)
- provenance anyone can inspect without our permission
- evidence bound to the asset, so a buyer can see *why* a credit is trustworthy

**How we say it:** *we are not fixing the ledger; ledgers were never the problem. We are fixing what
gets written into one.*

---

## 9. Almost no machine learning, deliberately

- **Yield forecast** — physics plus a weather API. No model.
- **Physics ceiling** — arithmetic. Deliberately no model; that's what makes it unarguable.
- **Imagery → biomass** — a small calibration regression, fit from a handful of labelled points.
- **Crash early-warning** — the one legitimate model, and we can generate unlimited labelled
  training data from our own twin. Build it last, or not at all.

Every number a judge can check by hand is a number they cannot argue with. Do not add a model to
look sophisticated.

---

## 10. Raw SQL, no ORM

An ORM is a second thing to learn and it hides the query actually running. We write explicit column
lists — never `SELECT *` in application code — so the cost of a query is visible at the call site.
