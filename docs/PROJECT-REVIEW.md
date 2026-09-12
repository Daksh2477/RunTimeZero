# AlgaCarbon project review

Review date: 12 September 2026. Reviewer: `review-7c62`.
Scope: local PDFs, project documentation, authored application modules, database
schema and read-only data counts, physics, firmware, scripts and contracts.
This is an assessment, not a certification of scientific or market claims.
The checkout is changing concurrently; simulator and Sentinel ingestion work
appeared during review. No application code was changed by this reviewer.

## What the project is

**AlgaCarbon**, by team **RunTimeZero**: Daksh (leader), Chetan, Henil and Mahit.
Chosen statement: **Algae-Based Carbon Sequestration Monitoring Platform**, under
**Circular Carbon Ecosystem**. The intended users are algae operators, carbon
verifiers, environmental researchers and investors.

The statement asks for sensor/IoT data combined with satellite or drone imagery
for verification and reporting of carbon capture performance. The guidelines
require one statement and emphasize user needs and impact. Suggested technology
is explicitly optional: four ML models and blockchain are not mandatory.

The ideation differentiator is cross-checking operator claims against a separate
evidence stream and a physics ceiling. Monitoring and farm advisories make the
platform useful to operators; public evidence and eventual issuance/retirement
serve verifiers and buyers. Wastewater treatment is the proposed economic host.

The PDFs also contain proposed tier pricing, hardware costs, treatment benefits,
market statistics and regulatory assertions. These are proposal assumptions,
not measurements from this repository. Their cited external sources have not
been independently checked in this review. Both PDFs are ignored by `*.pdf` in
`.gitignore`, so a teammate cloning the repository will not receive them.

## Source map

| Source | What it contributes |
|---|---|
| [Ideation PDF](../RunTimeZero_Ideation_HackOut26.pdf) | Thesis, decision history, features, business model, tier pricing, pitch and references |
| [Problem statements](../HackOut26_Problem_Statements.pdf) | Official scope, users, impact and hackathon rules |
| [Decisions](DECISIONS.md) | Verification boundary and intended credit policy |
| [Architecture](ARCHITECTURE.md) | Planned components and data paths |
| [How it works](HOW-IT-WORKS.md) | Narrative explanation; several claims now differ from code |
| [Running](RUNNING.md), [onboarding](ONBOARDING.md) | Local setup; seed/replay are destructive demo tools |
| `packages/types` | Sites, telemetry, evidence, credits, economics and dispositions |
| `packages/physics` | Solar model, growth model, ceiling, seeded twin, faults and WASM API |
| `apps/api` | MQTT, estimation, reconciliation, fleet/advisories, verifier, simulator |
| `apps/web` | Fleet, pond detail, public verification and new simulator page |
| `apps/firmware` | ESP32/Wokwi source, circuit and calibration |
| `apps/contracts` | Evidence, credit issuance, retirement certificates and tests |
| `packages/models`, `packages/chain` | Mostly planned interfaces/documentation |

## Implemented versus demonstrated

| Capability | Observed status |
|---|---|
| Rust physics and deterministic twin | Implemented; 44 tests passed in this review |
| MQTT ingestion and simulator publisher | Implemented; live delivery not exercised here |
| ESP32/Wokwi | Firmware and circuit exist; no firmware build or Wokwi run performed |
| Database | Nine tables; existing local demo data inspected read-only |
| Estimation and reconciliation | Implemented, with material accounting/policy issues below |
| Operator console and public verifier | Implemented; web typecheck passed, browser interaction not tested |
| Farm advice | Seven rule-based advisory types; not trained AI predictions |
| Public simulator | Backend and `/sim` page present; concurrent work, not an absent feature |
| External satellite ingestion | New `sentinel.ts` and ingestion script appearing during review; no successful external retrieval verified |
| Models | README and Python requirements; no training scripts, trained artifacts or inference wrappers found at inspection |
| Contracts | Three implemented contracts; 10 existing tests passed locally |
| API-to-chain issuance | No completed orchestration/bindings found; `packages/chain` is a placeholder |
| MRV export / disposition proof flow | Types/schema exist; no complete report generation and proof workflow found |
| Expense ledger | Schema and aggregate endpoint exist; no recorded expenses or complete input UI found |
| Weather forecast | Physics uses simulated/default conditions; no live weather ingestion found in reviewed source |

## Local demo data snapshot

Read with `BEGIN READ ONLY` against local `algacarbon`; no seed/replay was run.

| Table | Rows |
|---|---:|
| sites | 4 |
| ponds | 7 |
| telemetry | 588 |
| imagery_observations | 26 |
| harvest_records | 14 |
| divergence_checks | 7 |
| estimates | 0 |
| batches | 0 |
| expenses | 0 |

Seed scenarios: Naroda CETP (RW-01/02/03), Surat Textile (TX-A/B), Anand Dairy
(DP-1), Bhavnagar smallholder (SH-1). These are demo configurations, not confirmed
operating customer sites. Replay injects 30% overstatement into RW-02 and a crash
into TX-A. Both telemetry and evidence are generated from the twin; satellite
and weighbridge references in replay are synthetic identifiers.

## Fix before relying on verification results

### 1. Align the credit policy and the pitch

`packages/types/src/reconcile.ts::creditableAmount` uses the central independent
estimate for `ok`, the lower bound for `watch`, and zero for flagged/missing
evidence. `BatchEvidence.attest` enforces a central-estimate ceiling but does not
enforce the stored independent lower bound or the backend verdict. README and
other prose repeatedly advertise the lower bound as the universal rule.

A database-free reproduction with independent estimate 183 kg credits 170 kg
when the claim is 170, and 183 kg when the claim is raised to 190; both are `ok`.
Therefore “inflating a claim can never increase issuance” is too broad. The cap
limits issuance, but raising a claim can increase it until the cap is reached.
Choose one documented policy and use the same cases across API, contract and UI.

### 2. Correct production and harvest accounting

`apps/api/src/reconcile/estimate.ts` adds direct weighed observations to the
harvest total without reconciling their identity. A 100 kg harvest present in
both inputs produces a 200 kg estimate (reproduced). The schema has no unique
harvest reference binding these streams.

Imagery first clamps negative standing-biomass change to zero, then adds harvest.
For a 1,000 m² pond at 0.3 m depth, NDCI 0.4 -> 0.2 maps to 300 -> 150 kg standing
biomass. Adding a 100 kg harvest currently returns +100 kg production. Under the
stated inventory balance, change plus harvest is -50 kg; clamping that result
would give zero, not +100 (reproduced). Preserve the signed change until the
inventory calculation is complete. Define treatment of losses, initial stock,
partial observation windows and independently weighed harvests explicitly.

Replay also labels sampled standing biomass as weighbridge mass for SH-1; those
samples are then summed as if they were distinct harvested quantities.

### 3. Make repeated checks and overlapping windows safe

`db/client.ts::consecutiveSameDirection` counts prior rows, not distinct,
non-overlapping periods. Reconciliation inserts a fresh check for every request;
there is no window uniqueness rule. Repeating a positive-divergence period can
therefore accumulate a systematic flag. The pure engine reproduces `ok, ok, ok,
flagged` for identical inputs with priorRun 0, 1, 2, 3; the database behavior was
identified by source inspection rather than mutating the shared database.

`routes/fleet.ts` sums all check amounts for economics, so repeated/overlapping
checks can also inflate totals. Separate verification attempts from accepted
accounting periods, and make retry behavior explicit. On-chain, issuance is
capped per token ID, but identical evidence can be attested as another batch ID;
there is no unique evidence/window key preventing cross-batch duplication.

### 4. Establish real evidence and immutable provenance

Replay is a useful synthetic demonstration, but it is not an external validation
of satellite biomass inference. The current NDCI conversion is explicitly a
placeholder (`NDCI * 2.5`), and channel bands are fixed assumptions.

The public verifier queries whatever observations currently fall in the window;
it does not retrieve an immutable snapshot of exactly the evidence used for the
check. Later inserts can change the displayed evidence trail. It also lacks all
inputs needed to reproduce the ceiling, including the actual temperature used.
Persist source IDs, raw inputs, method version and evidence selection per check.

New Sentinel code should be reviewed before labeling it operational. It builds
a square using max(length, width), which includes surrounding land for a narrow
raceway; site coordinates are not an individual pond polygon. Its sourceRef is
constructed from a date rather than an actual scene identifier. Confirm spatial
bounds, resolution units and response semantics against provider documentation
and a real response before claiming usable independent pond observations.

### 5. Separate captured biomass from removal credits

The reconciliation input has no disposition or durability proof. The UI calls
its result “credited” even though there are no batches in the local database.
The contract accepts an allowed disposition enum, but does not establish that a
physical disposition occurred. A report CID merely has to be a nonempty string.

The simulator adds biofertiliser revenue AND credit revenue from total simulated
uptake, without applying the project's own disposition eligibility rule. This
contradicts the stated exclusion of fertiliser use from removal crediting.
Present simulated capture, evidence-supported capture, eligible removal and
issued credits as separate quantities. Scientific durability and net-emissions
assumptions still need external validation before claiming real removals.

### 6. Repair build configuration and demo timing

The root non-emitting TypeScript check returned 322 diagnostics at the initial
snapshot: 283 JSX errors, 21 TS-extension errors, 5 unused suppression errors,
2 module-resolution errors and 11 implicit-any errors. Root config includes web
files without its JSX/alias configuration. Web's own config passed. CI uses the
root configuration, so this is a delivery issue even with passing Rust tests.

`sim-driver.ts` compresses many simulated hours into each real second, while MQTT
ingestion stamps receipt time and ignores simulated observation time. Claims
then represent a different duration from the date-based ceiling. The live driver
also does not publish corresponding independent observations or harvest records.
Choose a consistent simulation clock for the demonstration.

## Further issues worth addressing

- **Live UI:** server-rendered console pages fetch on request, with no polling or
  refresh mechanism. Turning a Wokwi knob does not automatically refresh them.
  Reconciliation is manually triggered via POST; neither replay nor telemetry
  insertion automatically produces a new check.
- **Missing-data wording:** an unchecked fleet can say every claim is backed;
  missing pH/temperature can generate condition warnings as if a measurement
  existed. Treat unknown separately from healthy or unhealthy.
- **Time windows:** fleet telemetry uses row limits named as hours; at different
  sample rates “48 hours” and “14 days” cover different durations.
- **Input validation:** reconciliation accepts date strings without checking
  validity, ordering or a maximum duration before running the ceiling loop.
  MQTT accepts negative optional uptake, loses seq/raw/source-time metadata and
  does not deduplicate messages. The firmware's default pond ID is not a UUID
  from the seeded database, and the firmware sends no CO₂ uptake field.
- **Physics scope:** the ceiling includes atmospheric transmittance and a strain
  temperature response, using operator temperature data. “No model,” “no trust”
  and “no cultivation system can exceed this” overstate what the implementation
  establishes. The 1.83 conversion also assumes a carbon fraction; stoichiometry
  does not independently prove that assumed fraction for every batch.
- **Physics follow-up:** attenuation is documented in m²/g but multiplied by a
  numeric g/L value without converting to g/m³; audit units before tuning. Thermal
  shock changes state before step(), which overwrites temperature from its normal
  daily curve; its observation effect does not establish the intended growth effect.
- **Architecture wording:** replay writes telemetry directly; the simulator is
  now imported into the API process, and WASM exports an offline truth accessor.
  Reconciliation does not call it, but separation is not physically enforced by
  MQTT. Describe the actual module boundary and test it.
- **Setup:** API/scripts do not automatically load the root `.env`; instructions
  that only copy it are incomplete. Contracts are outside root npm workspaces,
  while some docs use workspace commands. ABI/model scripts are documented but
  absent. Evidence append-only behavior is a convention, not DB enforcement;
  seed/replay explicitly delete history.

## Recommended finishing order

1. Agree on capture/credit terminology and one credit policy.
2. Fix mass balance, duplicate evidence and repeated-window accounting with
   small, targeted regression cases; repair root typechecking.
3. Complete one credible imagery input for a correctly bounded pond, with honest
   synthetic/real provenance labels and reproducible evidence snapshots.
4. Connect ingestion -> a bounded reconciliation period -> console refresh ->
   public report. Demonstrate honest, inflated, missing-evidence and crash cases.
5. Connect disposition, report and contract issuance only after quantities are
   correct. Keep a local-chain demonstration if external deployment is unverified.
6. Add one useful ML capability only if time remains and its evaluation is
   credible. Four model placeholders do not improve statement alignment.

The current code provides substantial demonstration infrastructure. The biggest
remaining work is making its evidence and accounting match the verification
claim. A coherent monitoring-and-verification flow is the priority for the
chosen statement; marketplace and extensive model work can wait.

## Validation performed

- Rust: `cargo test --offline --locked --manifest-path packages/physics/Cargo.toml
  --target-dir /tmp/rtz-review-7c62-rust-target` — **44 passed**.
- Contracts: temporary copy, `hardhat test --no-compile` — **10 passed**. Existing
  artifact build-info matched all three current Solidity source files. No
  external deployment and no fresh compiler run were performed.
- Root: `tsc --noEmit --incremental false --pretty false` — **failed**, as above.
- Web: `tsc -p apps/web/tsconfig.json --noEmit --incremental false` — **passed**
  at initial snapshot; concurrent additions may need their own validation.
- Database-free estimator/reconciliation examples reproduced the results above.
- Read-only local database counts; no database or application changes.
- No browser, hardware, external imagery, scientific literature, price/regulatory
  verification or end-to-end minting validation performed.

Test logs are in `/tmp/rtz-review-7c62-*.log`. Agent notes and inter-chat handoffs
are in `coordination/`. Findings are observations at review time, not ownership
of application fixes; claim files before implementing changes.
