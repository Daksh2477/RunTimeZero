# AlgaCarbon — Architecture

Everything runs on one laptop. No servers, no cloud, no hosting. The only external calls are a free
weather API, a free satellite data API, a public MQTT broker, and a testnet RPC.

---

## 1. The whole system, end to end

```mermaid
flowchart TB
    subgraph HW["🔌 Hardware layer — simulated, firmware is real"]
        WOKWI["Wokwi ESP32<br/>pH · DO · optical density · temp<br/>real firmware, real calibration"]
        TWIN["Rust twin → WASM<br/>Monod kinetics · many ponds<br/>injectable faults"]
    end

    BROKER(["MQTT broker<br/>broker.hivemq.com"])

    subgraph API["⚙️ API — Express + Postgres"]
        INGEST["ingest/<br/>mqtt subscriber"]
        SAT["ingest/sentinel<br/>Copernicus → NDCI"]
        DB[("Postgres<br/>9 tables")]
        ENGINE["reconcile/engine<br/>THE CORE"]
        CEIL["physics ceiling<br/>no fitted params"]
        MODELS["models/<br/>4 ONNX models"]
    end

    subgraph CHAIN["⛓️ Ethereum Sepolia"]
        EV["BatchEvidence<br/>ERC-721"]
        CC["CarbonCredit<br/>ERC-1155"]
        RC["RetirementCertificate<br/>ERC-721 soulbound"]
    end

    subgraph WEB["🖥️ Next.js"]
        CONSOLE["/console<br/>operator"]
        VERIFY["/verify<br/>public"]
        SIM["/sim<br/>public"]
    end

    WOKWI -->|"WiFi + MQTT"| BROKER
    TWIN -->|"MQTT"| BROKER
    BROKER --> INGEST
    INGEST --> DB
    SAT --> DB
    DB --> ENGINE
    CEIL --> ENGINE
    ENGINE -->|"verdict only"| MODELS
    MODELS -.->|"never touches credit amount"| ENGINE
    ENGINE -->|"attestation"| EV
    EV --> CC
    CC -->|"burn"| RC
    DB --> CONSOLE
    EV --> VERIFY
    TWIN --> SIM

    style ENGINE fill:#0f5d58,color:#fff
    style CEIL fill:#a8442a,color:#fff
    style BROKER fill:#2d4a7c,color:#fff
```

**The one thing to notice:** there is no arrow from the twin into the API. Pond data reaches the
engine *only* by crossing an MQTT wire as a noisy, quantised sensor reading. That is what makes
"the engine never sees ground truth" a property of the wiring rather than a promise.

---

## 2. The verification mechanism

This is the product. Everything else is plumbing around it.

```mermaid
flowchart LR
    subgraph OP["Operator-controlled"]
        T["telemetry<br/>CO₂, pH, DO, temp"] --> CLAIM["claimed uptake"]
    end

    subgraph IND["Independent of operator"]
        S["Sentinel-2 / drone<br/>/ weighbridge slip"] --> EST["derived biomass<br/>× 1.83 → CO₂<br/>with error band"]
    end

    PHYS["physics ceiling<br/>lat · area · light · temp<br/>ARITHMETIC ONLY"]

    CLAIM --> R{{"reconcile"}}
    EST --> R
    PHYS --> R

    R --> OUT["creditable =<br/>min(claim, est_low, ceiling)"]
    OUT --> MINT["mint on chain"]

    style R fill:#0f5d58,color:#fff
    style PHYS fill:#a8442a,color:#fff
    style OUT fill:#16211f,color:#fff
```

Three guards, in order of strength:

| Guard | Catches | Can it be argued with? |
|---|---|---|
| **Physics ceiling** | Physically impossible claims | No. It's orbital mechanics and pond area. |
| **min() rule** | Any overstatement above the evidence floor | No. It's arithmetic. |
| **Divergence classifier** | *Clever* fraud that stays under the ceiling | Yes — so it only sets the verdict, never the amount. |

The third one exists because a careful fraudster sits just under the ceiling and overstates by 8%
forever. Each window looks fine. The pattern doesn't.

---

## 3. Every feature, and where it lives

```mermaid
mindmap
  root((AlgaCarbon))
    Operator console
      Fleet board
        yield vs forecast
        divergence status
        days to harvest
        open alerts
      Site detail
        live telemetry charts
        claimed vs independent vs ceiling
        72h yield forecast
      Crash early-warning
        predicted collapse window
        dominant cause
        cost of acting vs not
      Expense ledger
        paddlewheel · pumping
        harvesting · drying
        cost per tonne CO₂
        vs aeration baseline
      Disposition helper
        sell or bury this batch
    Verification
      Dual-stream ingestion
      Independent estimator
      Physics ceiling
      Divergence scoring
      MRV report → IPFS
    Marketplace
      Batch evidence NFT
      Fractional credits
      Retirement certificate
      Public credit verifier
    Public
      Simulator
        configure a pond
        projected yield + economics
      Verify page
        paste token id
        see the evidence
```

| Surface | Route | Who | Needs login |
|---|---|---|---|
| Operator console | `/console` | Pond operator | Yes |
| Public verifier | `/verify` | Anyone | No |
| Public simulator | `/sim` | Anyone | No |
| API | `:4000` | — | — |

---

## 4. Data model

```mermaid
erDiagram
    sites ||--o{ ponds : has
    ponds ||--o{ telemetry : "claims (append-only)"
    ponds ||--o{ imagery_observations : "evidence (append-only)"
    ponds ||--o{ harvest_records : "evidence (append-only)"
    ponds ||--o{ estimates : derives
    ponds ||--o{ divergence_checks : reconciles
    sites ||--o{ batches : produces
    sites ||--o{ expenses : incurs
    divergence_checks }o--|| batches : "rolls up into"

    sites {
        uuid id PK
        text name
        float lat
        float lon
        enum tier
        enum host_industry
    }
    ponds {
        uuid id PK
        float area_m2
        float depth_m
        float width_m "< 40m = no satellite"
    }
    telemetry {
        timestamptz observed_at
        float co2_uptake_kg "THE CLAIM"
        enum source
    }
    imagery_observations {
        enum channel
        float chlorophyll_index
        float measured_dry_mass_kg
        text source_ref "re-fetchable"
    }
    divergence_checks {
        float claimed_co2_kg
        float independent_low_co2_kg
        float ceiling_co2_kg
        enum verdict
        float creditable_co2_kg "min() of the three"
    }
    batches {
        enum disposition "must be durable"
        text mrv_report_cid
        text evidence_token_id
    }
```

Evidence tables are **append-only**. Never `UPDATE`, never `DELETE`. A later reading supersedes an
earlier one; the original stays. A verification system that can quietly rewrite its own inputs
verifies nothing.

---

## 5. Credit lifecycle

```mermaid
sequenceDiagram
    participant P as Pond
    participant N as Sensor node
    participant A as API
    participant S as Satellite
    participant E as Engine
    participant C as Chain
    participant B as SME buyer

    P->>N: physical state
    N->>A: MQTT telemetry (the claim)
    S->>A: NDCI observation (independent)
    A->>E: claim + estimate + ceiling
    Note over E: creditable = min(all three)
    E-->>A: verdict + amount
    A->>A: record disposition (buried/biochar/bioplastic)
    A->>C: mint BatchEvidence (ERC-721) + report CID
    A->>C: mint CarbonCredit (ERC-1155), capped
    B->>C: buy fraction of batch
    B->>C: burn → RetirementCertificate
    Note over C: irreversible, public, non-transferable
```

Step 7 — recording disposition — is the one most proposals skip. Without a durable outcome you've
certified *utilisation*, not removal, and the credit is invalid no matter how faithfully the chain
recorded it.

---

## 6. Repo map

```
runTimeZero/
├── packages/
│   ├── types/          shared TS types — the contract between everything
│   ├── physics/        Rust → WASM: solar, growth, ceiling, sim, faults
│   ├── models/         4 models: train in Python, run as ONNX in Node
│   └── chain/          contract ABIs + ethers bindings
├── apps/
│   ├── api/            Express + Postgres
│   │   └── src/{routes,services,ingest,reconcile,db}
│   ├── web/            Next.js: (console) (verify) (sim)
│   ├── firmware/       real ESP32 firmware, simulated board
│   └── contracts/      3 Solidity contracts
├── scripts/            commit.sh, push.sh, seed.ts
└── docs/               this file, DECISIONS.md, HOW-IT-WORKS.md, ONBOARDING.md
```

---

## 7. Why the stack is what it is

| Choice | Reason |
|---|---|
| **TypeScript nearly everywhere** | One runtime to debug at 4am, with three teammates learning as they go |
| **Rust → WASM for physics** | Deterministic math; compiled to WASM it runs *identically* server-side and in the browser, so the public simulator and the verification engine can't drift apart |
| **Raw SQL, no ORM** | An ORM is a second thing to learn and hides the query actually running |
| **npm workspaces, not pnpm** | Works with a bare Node install — one less setup step |
| **Copernicus statistics API** | Returns numbers, not GeoTIFFs. No raster processing at all |
| **Public MQTT broker** | Wokwi reaches it for free; no Wokwi Club subscription needed |
| **ONNX for models** | Train in Python offline, infer in Node. Python never enters the request path |
| **Ethereum Sepolia** | Every wallet and explorer supports it without adding a custom network, so a judge can click a transaction link and see it. Polygon Amoy is the better chain on merit — near-free gas, and tokenised carbon already lives on Polygon — and `hardhat.config.cjs` keeps it configured, but its faucet requires a mainnet ETH balance we are not going to fund for a testnet |

### Everything runs locally

| Component | Where | External dependency |
|---|---|---|
| API + Postgres | your laptop | — |
| Next.js | your laptop | — |
| Rust twin | your laptop | — |
| Models | your laptop, ONNX runtime | — |
| Wokwi node | browser | public MQTT broker |
| Weather | — | Open-Meteo (free, no key) |
| Satellite | — | Copernicus (free account) |
| Chain | — | Sepolia public RPC (free) |

CI runs `cargo test` and `tsc` on push. That's all it does. **It deploys nothing.**
