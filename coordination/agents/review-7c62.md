# review-7c62

Updated: 2026-09-12T03:15:39.083535+00:00
Status: active — read-only project review and coordination setup.
Claimed application paths: none.

## Context reviewed

- Both PDFs: `RunTimeZero_Ideation_HackOut26.pdf` and
  `HackOut26_Problem_Statements.pdf` (text extracted into `/tmp`).
- Root README; decisions, architecture, how-it-works, onboarding and running docs.
- API reconciliation/estimator, reconciliation service, routes, server, MQTT.

## Reusable findings

- Chosen statement: Algae-Based Carbon Sequestration Monitoring Platform;
  Circular Carbon Ecosystem. The guideline explicitly says technology suggestions
  are advisory, not mandatory. Four ONNX models are not a hackathon requirement.
- Proposed core: compare operator claims with independent evidence plus a physics
  ceiling; track durable disposition; optionally issue traceable on-chain credits.
- README/pitch advertises `min(claim, independent lower bound, ceiling)`.
  `apps/api/src/reconcile/engine.ts` explicitly uses the central estimate for an
  `ok` result and the evidence floor for `watch`. Reconcile this policy mismatch.
- `apps/api/src/reconcile/estimate.ts` uses a placeholder `NDCI * 2.5` mapping.
  Direct mass is summed and harvestedDryKg is added; check for duplicate harvest
  evidence before trusting credit totals. This is a review concern, not yet a
  reproduced bug.
- Four consecutive positive divergences trigger zero credits; review whether
  rerunning the same window incorrectly counts as new independent evidence.
- Pitch promises real independent input from day one; README marks Copernicus
  ingestion unfinished. Inspect replay provenance before claiming real evidence.
- The proposed physics/no-model and fraud-proof claims need narrower wording;
  arithmetic still depends on the validity and independence of its inputs.

## Existing work to preserve

Observed untracked `apps/api/src/routes/simulate.ts` and modified
`apps/api/src/server.ts`. I did not create or edit either. Simulator route now
appears registered. Treat these as another contributor's active work.

## Validation / next step

No application tests or services started. No database changes. No commits.
Continue reading physics, contracts, replay, schema, models and web to distinguish
implemented features from planned features; record a consolidated review.

## Additional source review

- Read shared credit types, all three Solidity contracts, replay, physics ceiling,
  and model design. `BatchEvidence.attest` caps against the central estimate;
  it stores the lower bound but does not enforce it as the cap.
- Replay constructs both telemetry and imagery/weighbridge observations from
  the same twin. Its Sentinel source IDs are generated strings, not evidence of
  retrieved satellite scenes. Label this synthetic demo evidence explicitly.
- Replay inserts telemetry directly into Postgres and deletes demo history.
  Therefore the documentation's “MQTT is the only path” claim is not literal.
- The ceiling applies strain temperature limitation using measured temperature,
  so describing it as geometry and orbital arithmetic alone is inaccurate.
- No test suite has been run in this review; existing test counts are repository
  claims, not fresh verification. No application files were changed by me.

Coordination setup complete. No outstanding file claims or held claim gate.
Other agent acknowledgment has not yet been observed. Remaining review areas
include full web flows, DB queries/schema, firmware and test execution.

Last handoff update: 2026-09-12T03:16:13.313556+00:00
