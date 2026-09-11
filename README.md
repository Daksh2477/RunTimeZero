# AlgaCarbon

Verification platform for algae-based carbon sequestration.
**Team RunTimeZero** — HackOut'26, Circular Carbon Ecosystem.

---

## The one rule the whole project exists to enforce

An operator's carbon claim is just their word. We compute a second, independent estimate from
evidence the operator doesn't control, and **credit only the lower of the two**:

```
mintable = min(claimedUptake, independentEstimate)
require(claimedUptake <= physicsCeiling)
require(disposition in {buried, biochar, bioplastic})
```

This doesn't just *detect* overstatement — it makes overstatement **pointless**, because inflating
a claim can never increase what gets issued.

If you're about to write code and can't explain how it serves that rule, ask before you write it.

---

## Repo layout

```
algacarbon/
├── packages/
│   ├── types/        Shared TypeScript types. The contract between everything.
│   ├── physics/      Rust → WASM. Solar geometry, growth kinetics, the ceiling.
│   └── chain/        Contract ABIs + ethers bindings.
├── apps/
│   ├── api/          Express + Postgres. Ingestion, reconciliation, attestation.
│   ├── web/          Next.js. Operator console + public pages.
│   └── contracts/    Hardhat. Three Solidity contracts.
├── scripts/          commit.sh, push.sh, seed.ts
└── docs/             ARCHITECTURE.md, ONBOARDING.md, DECISIONS.md
```

Full detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Getting started

**Never used this repo before? Read [`docs/ONBOARDING.md`](docs/ONBOARDING.md) first.** It assumes
you know nothing about this stack and walks through every step.

Short version:

```bash
git clone https://github.com/Daksh2477/RunTimeZero.git
cd RunTimeZero
npm install                 # npm workspaces — installs everything
cp .env.example .env        # then fill in the values
npm run db:setup            # creates schema in local Postgres
npm run dev                 # api on :4000, web on :3000
```

You need: Node 22+, Postgres 16+, and (only if you touch `packages/physics`) Rust + `wasm-pack`.

---

## Who owns what

Each person owns directories nobody else touches. If you need something from someone else's area,
**ask them to expose it through `packages/types` rather than editing their files.**

| Person | Owns | Don't touch |
|---|---|---|
| **Mahit** | `packages/types`, `packages/physics`, `apps/api/src/reconcile` | — |
| **Chetan** | `packages/physics/src/sim.rs`, fault injection, `scripts/seed.ts` | `reconcile/` |
| **Henil** | `apps/web/src/app/(console)`, `components/` | `(verify)`, `(sim)` |
| **Daksh** | `apps/api/src/ingest`, `apps/web/src/app/(verify)`, `(sim)` | `(console)` |

Contracts (`apps/contracts`) are ~150 lines total and are written once, by Mahit, on day 2.

---

## Git flow

```
feat/<area>-<thing>  →  develop  →  main (tagged)
```

- Branch per **task**, not per person: `feat/physics-ceiling`, `feat/console-fleet`.
- Merge into `develop` at least once a day. Don't sit on a branch for two days.
- `main` only receives something demoable.
- **Never force-push. Never rewrite history on `develop` or `main`.**

Commit messages: imperative, one line, no emoji.
`add solar irradiance model`, not `Added solar stuff!! 🚀`

```bash
./scripts/commit.sh "add solar irradiance model"
./scripts/push.sh            # will prompt for TOTP
```

---

## Rules that will save you pain

1. **Program files stay between ~150 and 250 lines.** If a file is growing past that, it's doing
   two jobs — split it.
2. **No new dependencies without asking Mahit.** We are deliberately dependency-light.
3. **No `SELECT *` in application code.** Explicit column lists, always.
4. **No default exports** except Next.js pages and components.
5. **`async/await`, never `.then()` chains.**
6. **Comment the non-obvious *why*, never the obvious *what*.**
7. The reconciliation engine **must never** see the simulator's ground truth. If it does, the whole
   project is a circular argument and the demo is worthless. See `docs/DECISIONS.md`.

---

## Build order

Each stage ends with something demonstrable. If we run out of time, we stop at a working stage
rather than half-finishing the next one.

| Stage | Deliverable | Proves |
|---|---|---|
| 0 | Types, schema, stub API | Everyone can work in parallel |
| 1 | Twin generates plausible telemetry; console renders it | The scenario is real |
| 2 | Copernicus ingestion; imagery → biomass → CO₂ | One genuinely external input exists |
| 3 | Reconciliation + physics ceiling, ground truth withheld | **The core claim** |
| 4 | Contracts on Polygon Amoy; capped mint, burn-to-retire | Issuance can't exceed verification |
| 5 | Console with forecast + fleet view; buyer view | The loop closes |
| 6 | Public simulator + public credit verifier | Anyone can check our work |

---

## The demo

We hand an evaluator the operator's screen and invite them to inflate the uptake figure. The
platform refuses it — showing the claimed curve against the physics ceiling and the independently
derived estimate — then mints only the verified lower amount on chain.

The engine has no access to the true value. It catches the overstatement from the disagreement
alone.
