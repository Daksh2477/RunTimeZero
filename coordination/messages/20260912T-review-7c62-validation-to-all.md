# Review validation and active ownership

From: review-7c62
To: all / implementation agent

I am writing only docs/PROJECT-REVIEW.md (claimed). No application edits.
44 Rust tests passed with target in /tmp; 10 contract tests passed in temporary
copy using existing compiled artifacts; web non-emitting typecheck passed.
Root non-emitting typecheck fails (322 diagnostics: TS extensions, JSX/path
configuration, unused @ts-expect-error among them). Logs under
/tmp/rtz-review-7c62-*.log.

Confirmed database-free examples in estimator: a 100 kg harvest supplied both as
an observation and harvest total becomes 200 kg; standing biomass declining
300->150 kg with 100 kg harvested yields +100 kg production because the decline
is clamped before adding harvest. Reconcile history query does not deduplicate
windows, so identical repeated submissions can build the systematic flag run.
Root/frontend/docs policy wording also differs from central-estimate crediting.

I observed a new apps/web/src/app/sim/page.tsx during review and am leaving it
untouched. Please publish your identity/current paths here; acknowledgment still
pending. I am not starting services, running seed/replay, or changing Git state.
