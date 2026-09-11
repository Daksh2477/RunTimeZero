# Architecture

## The shape of the system

Two streams describe the same pond. They are computed **separately** and compared only at the end.

```
OPERATOR-CONTROLLED                      INDEPENDENT OF OPERATOR
─────────────────────                    ───────────────────────
pond telemetry                           satellite / drone imagery
  CO₂, pH, DO, temp                        or a weighbridge slip
        │                                          │
        ▼                                          ▼
  reported uptake                          derived biomass
   (the claim)                            → growth → × 1.83
        │                                          │
        └──────────────┬───────────────────────────┘
                       ▼
              RECONCILIATION ENGINE
         credit = min(claim, independent)
         reject if claim > physics ceiling
                       │
                       ▼
              attestation → chain
```

**The engine never sees ground truth.** It has only the claim, the independent estimate, and what
physics permits. That is what makes a detected discrepancy a real finding rather than a restatement
of an answer we already had.

---

## Why the stack is what it is

| Choice | Reason |
|---|---|
| **TypeScript nearly everywhere** | One runtime to debug at 4am. Three of us are learning as we go. |
| **Rust → WASM for `physics`** | Deterministic math with no I/O. Compiled to WASM it runs *identically* on the server and in the browser, so the public simulator and the verification engine share one implementation of the twin instead of two that drift apart. |
| **Raw SQL, no ORM** | An ORM is a second thing to learn and hides the query that's actually running. |
| **npm workspaces, not pnpm** | Works with a bare Node install. One less setup step for teammates. |
| **Copernicus statistics API, not raster downloads** | Returns numbers, not GeoTIFFs. We skip image processing entirely. |
| **Polygon Amoy testnet** | Free gas, mature EVM tooling, and tokenised carbon already lives on Polygon. |

### The Rust abort condition

If `wasm-pack build` isn't producing a module `apps/api` can import **within 90 minutes**, stop and
port the physics to TypeScript. It's ~200 lines of arithmetic. It is not worth losing a day over.
This is written down so nobody has to make that call under pressure at 2am.

---

## The hardware layer

We have no ESP32 and no probes, so we built the node instead of pretending it exists.

```
 WOKWI (simulated ESP32)              MQTT broker            OUR API
 ┌──────────────────────┐                                  ┌──────────────┐
 │ pH / DO / OD pots    │──analog─┐                        │ mqtt         │
 │ DS18B20 temp    1-Wire────────►│  real firmware:        │ subscriber   │
 │ OLED + tx LED        │         │  read → calibrate ────►│      │       │
 └──────────────────────┘         │  → publish JSON        │      ▼       │
                                  └──simulated WiFi───►    │  telemetry   │
                                     broker.hivemq.com     │  (append-only)│
                                                           └──────────────┘
```

The firmware in `apps/firmware/src/main.cpp` is real: real analog reads, real two-point calibration,
real MQTT. Nothing in it knows it is being simulated.

**This is not cosmetic.** The API's *only* source of pond data is the MQTT subscription. There is no
code path from the twin's internal state into the reconciliation engine, so decision 6 — the engine
must never see ground truth — is enforced by the architecture rather than by discipline. What
crosses the wire is a quantised, noisy sensor reading and nothing else.

### Two layers of simulation

| Layer | Scope | Purpose |
|---|---|---|
| **Wokwi node** | One pond, visible circuit, knobs a human can turn | The demo. A judge can drag a potentiometer and watch the dashboard move. |
| **Rust twin** | Many ponds, Monod kinetics, real weather, injectable faults | The scale. Fleet view needs more than one pond; fault injection needs a model. |

Both publish to the same topics. The API cannot tell them apart, and neither can the engine.

### Later: the twin as a Wokwi custom chip

Wokwi's Custom Chips API accepts anything that compiles to WebAssembly, including Rust. Our physics
crate already builds to WASM, so the twin can become a virtual sensor board driving the node's inputs
directly. Better story, not a more important one — do it only after the core loop works.


---

## Packages

### `packages/types`
The contract between every other package. Written first, before any feature code, so all four of us
can work in parallel without blocking on each other.

If you need a new shared shape, add it here and tell the others. **Never** redeclare a shape locally
that already exists here.

### `packages/physics` (Rust → WASM)
Pure functions, no I/O, fully deterministic. Same input always gives the same output — which is what
makes it testable and what makes the ceiling defensible.

- `solar.rs` — solar position, day length, clear-sky irradiance for a lat/lon/date
- `growth.rs` — Monod kinetics under light, temperature and nutrient limitation
- `ceiling.rs` — maximum biomass gain physically achievable for a pond in a window
- `sim.rs` — the digital twin: steps a pond forward in time
- `faults.rs` — injectable failure modes (contamination crash, pump failure, overstated uptake)

### `packages/chain`
ABIs and typed ethers bindings. Generated from `apps/contracts`, committed so the API and web don't
need a Hardhat install.

---

## Apps

### `apps/api` — Express + Postgres

```
src/
├── routes/       one file per resource, thin — parse, call a service, return
├── services/     business logic, no HTTP knowledge
├── ingest/       Copernicus fetch, NDCI computation, telemetry intake
├── reconcile/    the engine, the divergence scoring, the MRV report
└── db/           schema.sql, migrations, query helpers
```

Routes never touch the database directly. Services never know what HTTP is. This split is what lets
us test the engine without spinning up a server.

### `apps/web` — Next.js App Router

Route groups map to subdomains via `middleware.ts`:

| Host (prod) | Local path | Route group | Audience |
|---|---|---|---|
| `app.algacarbon.*` | `/console` | `(console)` | Operator |
| `verify.algacarbon.*` | `/verify` | `(verify)` | Anyone, no account |
| `sim.algacarbon.*` | `/sim` | `(sim)` | Anyone, no account |

Don't touch DNS until the day before the demo. Local paths work fine until then.

### `apps/firmware` — Wokwi / PlatformIO

Real ESP32 firmware on a simulated board. See `apps/firmware/README.md`.

### `apps/contracts` — Hardhat

Three contracts, no novel token mechanics:

| Contract | Standard | Role |
|---|---|---|
| `BatchEvidence` | ERC-721 | One immutable evidence object per verified batch. Holds the divergence score, imagery IDs, disposition proof, and the IPFS CID of the MRV report. Minted by the oracle, never by the operator. |
| `CarbonCredit` | ERC-1155 | Token ID = batch ID. Fungible *within* a batch so it can be split; distinct *across* batches so every tonne traces to its evidence. Supply capped at mint. |
| `RetirementCertificate` | ERC-721, non-transferable | Minted when a buyer burns credits. Beneficiary, tonnage, originating batch, timestamp. Permanent. |

---

## Data model

Nine tables. Append-only where the record is evidence.

| Table | Notes |
|---|---|
| `sites` | One per facility. Location, tier, host industry. |
| `ponds` | Many per site. Area, depth, geometry for the ceiling calculation. |
| `telemetry` | **Append-only.** Operator-controlled readings. Never updated, never deleted. |
| `imagery_observations` | **Append-only.** The independent channel, whatever the tier. |
| `estimates` | Derived biomass and CO₂ per observation window. |
| `divergence_checks` | Claim vs independent, with error bounds and a verdict. |
| `batches` | A verified production batch; carries the on-chain token ID once minted. |
| `harvest_records` | Weighbridge mass + moisture. For the lowest tier this *is* the independent channel. |
| `expenses` | Electricity, labour, consumables — per site, per period. |

Full DDL in [`apps/api/src/db/schema.sql`](../apps/api/src/db/schema.sql).

---

## Verification tiers

Our independent channel is imagery, and imagery can't see a small pond. Rather than excluding small
operators, the **channel itself scales**:

| Tier | Size | Independent channel | On-site sensors |
|---|---|---|---|
| Smallholder | < 0.5 ha | Geotagged harvest photos + public weighbridge slip | None — phone only |
| Small | 0.5–2 ha | Drone or pole-mounted imagery, weekly | pH, DO, temp, optical density, energy meter |
| Mid | 2–10 ha | Drone + partial Sentinel-2 | + flow meters, PAR, pond level, LoRa gateway |
| Facility | 10 ha+ | Sentinel-2 — ponds are several clean pixels across | + SCADA, CO₂ mass-flow meter |

Sensor quality sets **how tight the divergence band is**, not whether verification happens. A
smallholder with no instrumentation still gets credits, at a wider band, priced accordingly.
