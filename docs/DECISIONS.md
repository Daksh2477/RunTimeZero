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

## 9. Models assist, arithmetic decides

**Revised.** An earlier draft of this file said "almost no machine learning". That was too absolute
and it ignored that the problem statement explicitly lists *AI/ML for growth and uptake modeling*.
The real principle is narrower and more useful:

> **No model decides what gets credited.** The hard rule in #5 does, using arithmetic a judge can
> recompute by hand. Models make the platform useful, and catch fraud the hard rule cannot.

**What stays model-free, permanently:**

- `physicsCeiling` — pond geometry, light, temperature. No fitted parameter ever.
- `creditableCo2Kg` — `min(claimed, independentLow, ceiling)`. Arithmetic.

**What we do train (see `packages/models/README.md`):**

| Model | Job | Why it is not decoration |
|---|---|---|
| `crash_classifier` | Culture collapse 24–48 h ahead | The operator's daily pain; the reason they open the app |
| `divergence_classifier` | Noise vs drift vs systematic overstatement | The hard rule refuses the impossible. A careful fraudster sits *just under* the ceiling and overstates 8% forever — each window looks fine, the pattern does not. This is the model that earns its place. |
| `yield_residual` | Learns site-specific shortfall against the physics forecast | Standard practice in energy forecasting: physics for the bound, ML for the correction. May only lower a forecast, never raise a claim. |
| `ndci_biomass` | Chlorophyll index → biomass, **with a prediction interval** | NDCI carries an error factor near 2.4. A point estimate would be dishonest; the interval is what the engine consumes, and a wide one simply credits less. |

**Training data is currently generated by our own twin, and that was over-justified.** An earlier
version of this note claimed no public dataset contains labelled crash events. That is wrong: the
ATP3 Unified Field Study (NREL, CC-BY 4.0, DOI 10.7799/1400389) publishes 19 months of real
raceway data from five sites — 15-minute pH, temperature, DO and PAR, plus harvest records with
contamination indicators. GLORIA and AquaSat likewise give real chlorophyll-to-reflectance pairs
for the NDCI calibration.

So three of the four models *should* be grounded in real data, and only `divergence_classifier`
has a genuine excuse — nobody publishes labelled fraud.
Every run is seeded, and every artifact ships with its metrics in `artifacts/<model>.meta.json`.

**The line nobody crosses:** if you are importing a model into
`apps/api/src/reconcile/engine.ts`, stop and re-read #5. The hard rule catches impossible claims,
the model catches clever ones, and neither is allowed to do the other's job.

Report honest numbers. A crash classifier at 0.78 AUC described as 0.78 is worth more than one we
claim is 0.95, because judges ask follow-up questions.

---

## 10. Raw SQL, no ORM

An ORM is a second thing to learn and it hides the query actually running. We write explicit column
lists — never `SELECT *` in application code — so the cost of a query is visible at the call site.

---

## 11. The hardware is simulated, but the firmware is real

**Context.** We have no ESP32 and no probes. The obvious move is to have the physics twin write
telemetry straight into Postgres and call that "simulated sensors".

**Why that would have been a mistake.** It puts the twin and the reconciliation engine in the same
process, one import away from each other. Decision 6 then survives only as long as nobody takes a
shortcut at 3am — and someone always does.

**Decision.** Build an actual sensor node: real Arduino firmware, real analog reads, real two-point
calibration, publishing real MQTT over Wokwi's simulated WiFi to a public broker. The API subscribes
to that broker. It has no other source of pond data.

**The property this buys.** The engine *physically cannot* see ground truth, because the only thing
crossing the wire is a quantised, noisy sensor reading. Decision 6 stops being discipline and
becomes architecture.

On stage that is the difference between "we promise we didn't cheat" and "we couldn't have".

**Secondary benefit.** The potentiometers on the Wokwi canvas mean an evaluator can turn a knob and
watch the dashboard move. A judge who touches the system remembers it.

**Two layers, deliberately.** The Wokwi node is one pond that a human can poke. The Rust twin drives
many ponds for the fleet view and fault injection. Both publish to the same topics, so the API
cannot tell them apart — and neither can the engine.
