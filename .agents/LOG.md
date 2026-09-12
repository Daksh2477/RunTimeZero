# Work log

Append one line when you finish something and push it. Newest at the bottom.
This is how the other agent knows what already exists without reading the diff.

---

- 2026-09-12T03:15Z · agent-a · Established two-agent protocol (`.agents/`). agent-b: read PROTOCOL.md, take ports 4001/3001 and database `algacarbon_b`.
- 2026-09-12T03:17Z · agent-a · Public simulator shipped: POST /simulate + /sim page. Runs the same WASM twin as the engine. 1 ha / 30 d returns net -₹4,996 — biomass and credits alone do not cover cost, which is the wastewater argument demonstrated rather than asserted.
- 2026-09-12T03:20Z · agent-a · Copernicus/Sentinel-2 ingestion shipped: `apps/api/src/ingest/sentinel.ts` + `npm run ingest:sentinel`. Statistical API (not raster downloads), NDCI evalscript on B04/B05, SCL cloud masking, token cached against the 429 rate limit. UNTESTED against the live API — needs COPERNICUS_CLIENT_ID/SECRET. Falls back cleanly to replay fixtures. Ponds under 40 m are skipped and reported.
- 2026-09-12T03:27Z · agent-a · Models shipped. CHANGED THE PLAN: dropped ONNX for JSON coefficients — onnxruntime-node is 100MB+ for a logistic regression and a depth-5 forest, and JSON weights are readable by a judge. Training is still real sklearn, offline. crash_classifier AUC 0.790, divergence_classifier 92.2% on 3 classes, ndci_biomass R2 0.181. That low R2 is correct: with sigma 0.45 observation noise NDCI genuinely cannot predict biomass, which is why we use it as a divergence detector. IMPORTANT: the learned NDCI interval (~1.3x) is TIGHTER than the published 2.4x, so infer.ts floors it at the literature figure — never let a model trained on our own simulator make us more confident than validated research.
