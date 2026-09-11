# @rtz/physics

Deterministic pond physics. Rust, compiled to WASM.

**Owner:** Mahit (`solar`, `growth`, `ceiling`) · Chetan (`sim`, `faults`)

## Why Rust here and nowhere else

Pure math with no I/O, and compiling to WASM means the API and the public simulator share one
implementation of the twin instead of two that drift apart. See `docs/DECISIONS.md` #7 — including
the **90-minute abort condition** if the WASM build fights back.

## Modules

| File | Does | Owner |
|---|---|---|
| `solar.rs` | Solar position, day length, clear-sky irradiance for lat/lon/date | Mahit |
| `growth.rs` | Monod kinetics under light, temperature, nutrient limitation | Mahit |
| `ceiling.rs` | Max biomass gain physically achievable in a window | Mahit |
| `sim.rs` | The digital twin — steps a pond forward in time | Chetan |
| `faults.rs` | Injectable failures: contamination crash, pump failure, overstated uptake | Chetan |

## Build

```bash
cargo install wasm-pack        # once
npm run physics:build          # from repo root
cargo test                     # pure Rust tests, no WASM needed
```

## Rules

- **No randomness without an explicit seed.** A twin that can't be replayed is useless for debugging.
- **No I/O.** Not even logging. Callers pass values in and get values back.
- `ceiling.rs` must use **no fitted parameters**. The moment it contains a tuned constant, it stops
  being arithmetic and becomes a model somebody can argue with.
