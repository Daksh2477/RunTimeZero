# api

Express + Postgres. **Owner: Mahit (`reconcile/`) · Daksh (`ingest/`).**

```
src/
├── routes/      thin — parse, call a service, return. No SQL here.
├── services/    business logic. No HTTP knowledge here.
├── ingest/      Copernicus fetch, NDCI, telemetry intake
├── reconcile/   the engine, divergence scoring, MRV report
└── db/          schema.sql and query helpers
```

Routes never touch the database. Services never know what HTTP is. That split is what lets us test
the engine without starting a server.

## Rules

- **No `SELECT *`.** Explicit column lists.
- `telemetry`, `imagery_observations` and `harvest_records` are **append-only**. Never UPDATE,
  never DELETE. A system that can rewrite its own inputs verifies nothing.
- `reconcile/` must never import from the simulator. See `docs/DECISIONS.md` #6.

## Run

```bash
npm run db:setup && npm run dev --workspace=apps/api
```
