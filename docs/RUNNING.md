# Running AlgaCarbon locally

Everything runs on one laptop. No servers, no cloud, no hosting.

---

## One-time setup

```bash
git clone https://github.com/Daksh2477/RunTimeZero.git
cd RunTimeZero
npm install
```

**Rust toolchain** (only needed if you touch `packages/physics`, but the WASM
build must exist for anything else to work):

```bash
curl https://sh.rustup.rs -sSf | sh
cargo install wasm-pack        # takes a few minutes, do it now
npm run physics:build          # produces packages/physics/pkg/
```

**Postgres:**

```bash
sudo apt install postgresql    # if you don't have it
createdb algacarbon
```

**Environment** — copy the example and check the database line:

```bash
cp .env.example .env
```

> **If you get `SASL: client password must be a string`**, node-pg tried TCP
> instead of the unix socket. The `?host=` parameter is what forces it:
>
> ```
> DATABASE_URL=postgresql:///algacarbon?host=/var/run/postgresql
> ```

---

## Bring the whole thing up

Four commands, in order. Each one is independently checkable.

```bash
export DATABASE_URL="postgresql:///algacarbon?host=/var/run/postgresql"

npm run db:setup     # 1. create the 9 tables
npm run db:seed      # 2. 4 sites, 7 ponds, all four verification tiers
npm run replay       # 3. 14 days of history — telemetry + independent evidence
npm run api          # 4. API on :4000, MQTT subscriber attached
```

You should see:

```
[api] listening on :4000
[mqtt] connected, listening on rtz/9f3a/pond/+/telemetry
```

Check it:

```bash
curl localhost:4000/health
# {"ok":true,"db":true}
```

---

## Watch the verification actually work

```bash
START=$(date -u -d '15 days ago' +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u -d 'tomorrow' +%Y-%m-%dT%H:%M:%SZ)
ID=$(psql -d algacarbon -tAc "SELECT id FROM ponds WHERE label='RW-02'")

curl -s -X POST localhost:4000/ponds/$ID/reconcile \
  -H 'content-type: application/json' \
  -d "{\"windowStart\":\"$START\",\"windowEnd\":\"$END\"}" | jq
```

`RW-02` is the pond the replay makes overstate by 30%. You should see its
`claimedCo2Kg` well above `creditableCo2Kg` — the inflation earns nothing.

Compare against `RW-01`, which is honest and identical in size. Same area, same
weather, same strain. Different claim.

**Current behaviour across the fleet:**

| Pond | Channel | Verdict | Claimed | Independent | Credited |
|---|---|---|---|---|---|
| RW-01 | sentinel2 | ok | 6896 | 7413 | **6896** |
| RW-02 | sentinel2 | ok | 8966 | 7359 | **7359** ← inflated 30%, gains nothing |
| RW-03 | sentinel2 | ok | 4828 | 4669 | **4669** |
| TX-A | sentinel2 | watch | 2299 | 546 | **228** ← crashed on day 9 |
| TX-B | sentinel2 | ok | 2300 | 1478 | **1478** |
| DP-1 | drone | watch | 575 | 257 | **161** |
| SH-1 | weighbridge | watch | 169 | 247 | **169** ← understating |

---

## Live streaming (optional)

To watch data arrive over MQTT in real time rather than as backfill:

```bash
npm run sim -- --speed 24        # 24 simulated hours per real second
```

The API's subscriber picks it up and writes to `telemetry`. Watch the row count
climb:

```bash
watch -n2 'psql -d algacarbon -tAc "SELECT COUNT(*) FROM telemetry"'
```

Flags: `--speed N` (sim hours per second), `--fraud 1.3` (overstatement factor).
Env: `SIM_FRAUD_POND`, `SIM_CRASH_POND` to retarget by label.

---

## The Wokwi hardware node

The one pond a human can physically poke.

1. Open [wokwi.com](https://wokwi.com), create a new ESP32 project
2. Paste `apps/firmware/diagram.json` into the **diagram.json** tab
3. Paste `apps/firmware/src/main.cpp` into the code tab
4. Press play

It joins `Wokwi-GUEST`, connects to `broker.hivemq.com`, and starts publishing.
Your local API is subscribed to the same topic, so readings land in Postgres.

**Drag a potentiometer and the dashboard moves.** That's the demo moment.

To point it at a real pond in your database, edit `POND_ID` in `main.cpp`:

```bash
psql -d algacarbon -tAc "SELECT id, label FROM ponds"
```

---

## Tests

```bash
cargo test --manifest-path packages/physics/Cargo.toml    # 44 tests
npm run typecheck
```

---

## Resetting

```bash
npm run replay      # wipes telemetry/observations/checks, regenerates 14 days
```

Fully destructive rebuild:

```bash
dropdb algacarbon && createdb algacarbon
npm run db:setup && npm run db:seed && npm run replay
```

---

## Later: hosting

Nothing here needs a server, and we would not host it before the demo — a
laptop that works beats a deployment that might not. When you do:

| Piece | Where it would go | Notes |
|---|---|---|
| Postgres | Neon or Supabase free tier | Schema applies unchanged |
| API | Fly.io or Railway | Needs a persistent process for the MQTT subscriber |
| Web | Vercel | Static-ish, trivial |
| Twin | Same box as the API, or a cron | Not latency-sensitive |
| Models | Ship the `.onnx` files with the API | No Python at runtime |
| Contracts | Already "hosted" — Polygon Amoy | Nothing to deploy but the contracts |

The only piece that genuinely needs an always-on process is the MQTT
subscriber. Everything else could be serverless.

**Do this after the demo works locally, not before.**
