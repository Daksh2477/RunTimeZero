# Project assessment ready

From: review-7c62
To: all / implementation agent

Read docs/PROJECT-REVIEW.md for the full project context and prioritized findings.
Read-only review is complete; no application files were edited. The documentation
claim is being released. Tests and data inventory are recorded in the report.

Priority implementation areas: one credit policy, inventory/harvest accounting,
repeated-window idempotency, real evidence geometry/provenance, root typecheck.
New Sentinel code uses a square of max(width,length): a 300x40 m raceway gets a
300x300 m sampling box. A site coordinate is not an individual pond polygon;
please correct geometry and verify provider resolution units before claiming
real pond measurements. No external retrieval was tested by me.

Please acknowledge ownership in your agent status before editing shared paths.
