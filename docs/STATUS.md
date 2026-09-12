# What we promised, and what exists

An audit of `RunTimeZero_Ideation_HackOut26.pdf` against the code, written
so that anyone can check a claim here by opening the file named beside it.

**The thesis, unchanged:** an operator's carbon claim is their word. We
derive an independent estimate from evidence they do not control, and credit
only the lower of the two. Inflating a claim cannot increase what is issued.

---

## The twelve features from the ideation

| # | Feature | State | Where it lives |
|---|---|---|---|
| 1 | Dual-stream ingestion | **Done** | `apps/api/src/ingest/mqtt.ts`, `imagery_observations` |
| 2 | Independent estimator | **Done** | `apps/api/src/reconcile/engine.ts` |
| 3 | Physics ceiling | **Done** | `packages/physics/src/ceiling.rs` |
| 4 | Yield & weather forecast | **Partial** | inside `services/advisory.ts`; no endpoint of its own |
| 5 | Digital twin | **Done** | `packages/physics/src/sim.rs` |
| 6 | Disposition tracking | **Done** | `services/mrv.ts`, enforced in `BatchEvidence.sol` |
| 7 | Public simulator | **Done** | `/sim`, WASM in the browser |
| 8 | Public credit verifier | **Done** | `/verify/batch/[id]`, `/verify/certificate/[id]` |
| 9 | Multi-site fleet view | **Done** | `/console` |
| 10 | Crash early-warning | **Done** | `services/advisory.ts` + `crash_classifier` |
| 11 | Full expense ledger | **Done** | `routes/fleet.ts` site economics |
| 12 | Disposition helper | **Partial** | rule enforced; the "sell or bury?" comparison UI is not built |

## Built since the ideation, not promised in it

| Feature | Why it exists |
|---|---|
| Biomass composition model | Protein/lipid decides what a harvest is worth. Feed at ₹240/kg against ₹12/kg as fertiliser — a 20× swing the ideation never accounted for |
| Produce marketplace | Carbon is worth a few hundred rupees a tonne; the biomass is worth tens of thousands. We were selling the smaller half |
| Researcher data licensing | Third revenue line, with consent that survives the sale |
| Investor noticeboard | Farms listing for capital, stapled to their verified production |
| Land management | Add and disable ponds. Nothing is ever deleted |
| Energy metering | A stopped paddlewheel is a leading crash indicator and the model was blind to it |

---

## How each part is built, and how it works

### The physics engine — Rust compiled to WebAssembly
`packages/physics/`, 34 KB, 53 tests.

Monod growth kinetics with Beer-Lambert self-shading, Steele photoinhibition
and a cardinal-temperature response. The **same binary** runs in the browser
and on the server, so the public simulator and the verification engine
cannot disagree about physics — a claim the ideation made and that is now
structurally true rather than aspirational.

The ceiling is the part that needs no trust at all. Photosynthesis needs
about eight photons per molecule of CO₂; PAR photons carry ~217 kJ/mol and
biomass ~477 kJ/mol, which caps conversion at **27.5% of incident PAR**.
Given latitude, area and dates, that is an upper bound no cultivation system
can beat. A claim above it is not doubtful, it is impossible.

### Reconciliation — the rule itself
`apps/api/src/reconcile/engine.ts`

```
creditable = min(claimed, independentLow, ceiling)     per window, summed
```

Summed per window and never netted: a pond that overstated in week one
cannot be cancelled out by one that understated in week two. The engine
never sees ground truth — `packages/physics/src/faults.rs` is the only exit
from the simulator's true state, and it adds sensor noise and ADC
quantisation on the way out.

### Evidence and the chain
`services/mrv.ts`, `apps/contracts/`

Each batch produces an MRV report hashed over **canonical JSON** — keys
sorted at every depth, fixed precision — so anyone holding the database can
recompute it. Six tests cover determinism and tamper detection.

The chain is optional by design. Anchoring adds public timestamping; it does
not add the proof. When no key is configured the API returns
`anchored: false` with a plain reason and never a fabricated receipt. Three
contracts, 17 tests: evidence attestation, ERC-1155 credits, soulbound
retirement certificates. Deploy instructions in `DEPLOY-CHAIN.md`.

### The models
`packages/models/`, scikit-learn → JSON coefficients → TypeScript inference.

No ONNX runtime; a judge can open `crash_classifier.json` and read the
weights. 21 features from four probes plus pond geometry, season and energy.
AUC 0.969 on simulator data with whole ponds held out — and **0.586 on real ATP3 field data**, which is
the number that matters and the one we will quote. Models set severity;
arithmetic sets the amount. Nothing a model outputs can change a credited
figure.

### The sensor node
`apps/firmware/` — real ESP32 C++ on a simulated Wokwi board, publishing
over MQTT to a public broker. The API's only path to pond data is that MQTT
topic, which makes the separation between claim and evidence structural
rather than a matter of discipline.

---

## Best use cases

**A textile mill running effluent ponds.** The strongest case. The pond
already has to treat the water, so the carbon is a by-product of a cost the
mill was paying anyway — and the same evidence proves both treatment and
capture. Under the CCTS, 490 obligated entities start reporting from
31 July 2026.

**A smallholder with under half a hectare.** We recommend *no sensors*:
weighed harvests are cruder but harder to dispute, and cheaper. The value is
the advisory and the marketplace, not instrumentation.

**A compliance buyer.** They are not shopping for the cheapest tonne; they
need one that survives an audit in three years. The refused percentage sits
next to the price, which no other marketplace shows.

**A researcher.** Claim-versus-evidence data is genuinely rare — most MRV
providers never publish the gap between what was claimed and what was
supported.

---

## How it aligns with the problem statement

The statement asked for a platform to monitor algae-based carbon
sequestration, with IoT integration or simulation, imagery, and a dashboard.

- **Monitoring** — MQTT telemetry from real firmware, hourly, seven ponds.
- **IoT / simulation** — both: real ESP32 code on a simulated board, and a
  physics twin anyone can run in their browser.
- **Imagery** — NDCI from Sentinel-2 B04/B05 as the independent channel,
  with the honest limit stated: 20 m bands need ~40 m of pond width, so
  below that we fall back to drone and weighbridge.
- **Dashboard** — four, by audience, because a farmer and an investor need
  different screens.

Where we went beyond it: the statement implies monitoring is the product.
We concluded the bottleneck is not measurement but **proof**, and built
verification instead. Every well-known carbon fraud was a true record of a
false number, so a prettier dashboard over the same self-reported figure
would change nothing.

---

## What is genuinely not done

- **On-chain anchoring is unexercised.** The code is written and the
  contracts are tested, but no key has been funded, so it has never run
  against a live network.
- **Copernicus is untested.** The NDCI path has no credentials, so imagery
  evidence is simulated.
- **`divergencePattern` and `biomassFromNdci` are trained but never called.**
- **Real pond data.** Everything is simulator-generated. The pipeline is
  real; the water is not.
- **No authentication.** `/enter` picks a role for navigation only and says
  so on the page.
