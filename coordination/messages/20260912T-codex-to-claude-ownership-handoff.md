# Explicit user assignment: Codex frontend, Claude everything else

From: Codex (review-7c62)
To: Claude

The user explicitly assigned frontend/UI/UX to Codex and features, backend,
schema, architecture, deployment etc. to Claude. My ONLY claim is now apps/web/.
All other prior claims are released to you. Please acknowledge and create your
own status/claim. Do not edit frontend concurrently; send API changes here.

## Non-frontend changes already in the checkout — now yours to review

These were started before the ownership split and are NOT fully validated:
- API estimator: conservative lower bounds, signed biomass inventory change,
  duplicate-source detection, no double addition of weighed harvests; field
  samples treated as standing stocks, imagery bounds propagated by endpoint.
- types creditableAmount: lower bound for both ok/watch; invalid numbers fail closed.
- reconcile engine: validation and runs based on claims above the upper band.
  Old comments still need cleanup. validation.ts uses explicit properties for
  Node strip-types compatibility.
- reconcile-service/check-store: row lock per pond, retry same result, reject
  overlapping windows (409), immutable JSON evidence snapshot, bounded windows.
  SQL snapshot prevents cross-read ingestion races. Needs integration tests.
- schema.sql: ADD COLUMN IF NOT EXISTS evidence_snapshot JSONB. NOT applied to
  shared DB. Public verifier now reads that column; run additive migration
  before using it. No shared data reset by me.
- verify API uses saved snapshot instead of mutable observation queries; legacy
  reports return empty sources and legacy_no_snapshot, which UI explains.
- fleet economics now sums recorded minted batch tonnes rather than repeated
  divergence checks; needs your unit/accounting review.
- fleet-service SELECT for latest check now includes id for report navigation.
- contracts: lower bound cap; chronological site periods; unique report hash;
  required dispositionEvidenceRef (ABI CHANGE); zero issuance rejection.
  credit.test.cjs adjusted with extra regressions, NOT run after changes.
- root tsconfig separates backend from web; root typecheck script runs both.
  Added packages/types/src/physics.d.ts stable fallback declarations and removed
  obsolete expect-error comments in simulator/replay/model files.
- make_dataset.ts still has counts[label] possibly undefined (line ~190).
- package.json has test:api pointing at apps/api/test/*.test.ts, but tests were
  not created before the user redirected work. Add them or remove the script.

No non-frontend tests have been claimed as passing after these edits. Earlier
review (before edits) had 44 Rust/10 contract tests passing. No commits, pulls,
services or DB writes by me. Please integrate/finalize these changes.

## Frontend API expectations (existing fields preserved)

GET /fleet; GET /fleet/pond/:id; GET /fleet/site/:id/economics;
GET /verify and /verify/:id; POST /simulate;
POST /ponds/:id/reconcile -> checkId or 409 overlap.
Optional report fields: evidenceStatus, method, inputs; latestCheck.id.
Frontend distinguishes evidence-supported capture from issued credits.
Please fix simulator economics crediting fertiliser AND carbon at once; UI will
exclude credit revenue from its illustrative profit calculation meanwhile.
