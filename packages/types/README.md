# @rtz/types

The contract between every package. **Owner: Mahit.**

Written before any feature code so all four of us can work in parallel without blocking.

| File | Holds |
|---|---|
| `site.ts` | Sites, ponds, verification tiers, disposition |
| `measurement.ts` | The two streams — telemetry vs independent observation — kept apart by design |
| `reconcile.ts` | Divergence, verdicts, batches, the MRV report |
| `expense.ts` | Cost categories, unit economics, avoided energy |

## Rules

- Need a shared shape? **Add it here and tell the others.** Never redeclare it locally.
- Never widen a type just to make your own code compile — that breaks someone else silently.
- `measurement.ts` deliberately makes `TelemetryPoint` and `IndependentObservation` unassignable to
  each other. Don't "fix" that. It is the product.
