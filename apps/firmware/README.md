# firmware — simulated pond sensor node

Real ESP32 firmware running on a simulated board in [Wokwi](https://wokwi.com).
**Owner: Chetan.**

We have no hardware. So rather than pretend sensors exist, we built the node: actual Arduino
firmware, actual analog reads, actual calibration maths, actual MQTT over a simulated WiFi stack
with real internet access. Nothing in `main.cpp` knows it is being simulated.

## Why this is not a gimmick

**The API receives pond data only as MQTT messages from this node.** There is no code path from the
physics twin's internal state into the reconciliation engine.

That makes `docs/DECISIONS.md` #6 — *the engine must never see ground truth* — a property of the
architecture rather than a rule people have to remember at 3am. The engine physically cannot see the
true value, because the only thing that crosses the wire is a sensor reading with noise and
quantisation already baked in.

Say this on stage. It is the difference between "we promise we didn't cheat" and "we couldn't have".

## The circuit

| Part | Pin | Stands in for |
|---|---|---|
| Potentiometer | GPIO 34 | pH probe (real ones output analog voltage too) |
| Potentiometer | GPIO 35 | Dissolved oxygen probe |
| Potentiometer | GPIO 32 | Optical density / turbidity |
| DS18B20 | GPIO 4 | Water temperature, 1-Wire |
| SSD1306 OLED | I²C 21/22 | Local status display |
| LED | GPIO 13 | Blinks on each MQTT publish |

The potentiometers are deliberate: **an evaluator can drag a knob on the circuit and watch the
dashboard react.** That is a better demo moment than any chart.

## Running it

1. Open [wokwi.com](https://wokwi.com), new ESP32 project
2. Paste `diagram.json` into the diagram tab, `src/main.cpp` into the code tab
3. Hit play — it joins `Wokwi-GUEST`, connects to `broker.hivemq.com`, starts publishing

Locally with PlatformIO + the Wokwi VS Code extension:

```bash
pio run                 # builds firmware.bin / firmware.elf
# then start the simulation from the Wokwi extension
```

## Topics

```
rtz/9f3a/pond/<pondId>/telemetry
```

Payload carries derived values **and raw volts**, so a wrong calibration constant can be corrected
downstream instead of losing the observation.

## Two layers of simulation, on purpose

| Layer | What it is | Why |
|---|---|---|
| **This node** | One pond, visible circuit, knobs a human can turn | The demo. Judges see hardware and can poke it. |
| **`packages/physics` twin** | Many ponds, driven by Monod kinetics and real weather | The scale. Fleet view needs more than one pond, and fault injection needs a model. |

Both publish to the same MQTT topics, so the API cannot tell them apart — and neither can the
reconciliation engine. That is the point.

## Later: the twin as a Wokwi custom chip

Wokwi's Custom Chips API accepts any language that compiles to WebAssembly, **including Rust**. Our
physics crate already builds to WASM, so the twin can become a virtual sensor board that drives this
node's inputs directly.

Worth doing only after the core loop works. It is a better story, not a more important one.
