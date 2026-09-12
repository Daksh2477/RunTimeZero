/**
 * The sensor node as a simulated electronic circuit.
 *
 * Every node here is simulated — nothing is bought — but it is specified as if
 * it would be: real parts, real pins, real transfer functions, Indian retail
 * prices. That keeps the simulation honest: a reading on the dashboard can be
 * traced back to a voltage on a pin, and a kit's cost to parts a farmer could
 * actually order.
 *
 * Pins and calibration constants MIRROR apps/firmware/src/main.cpp and
 * docs/HARDWARE.md. Change one, change all three.
 *
 * sensor-plan.ts prices a commercial multiparameter sonde per pond; this is the
 * discrete build of the same channels, which is what makes a small pond worth
 * instrumenting at all.
 */

export type Kit = 'basic' | 'standard' | 'industrial';

export interface CircuitPart {
  ref: string;
  part: string;
  role: string;
  bus: 'ADC1' | 'OneWire' | 'GPIO' | 'I2C' | 'UART' | 'SPI' | 'power' | 'mechanical';
  pin: string | null;
  qty: number;
  unitInr: number;
  supplyV: number | null;
  drawMa: number;
  /** Fraction of the time it draws `drawMa`. */
  duty: number;
}

export interface Net { from: string; to: string; label: string }

export interface NodeCircuit {
  kit: Kit;
  channels: string[];
  parts: CircuitPart[];
  nets: Net[];
  bomInr: number;
  power: { avgMaAt12V: number; dailyWh: number; panelW: number; batteryAh: number; autonomyDays: number };
  notes: string[];
}

// Firmware constants (apps/firmware/src/main.cpp).
const V_REF = 3.3;
const ADC_MAX = 4095;
const PH_V_AT_PH4 = 0.4;
const PH_V_AT_PH10 = 2.8;
const DO_V_AT_ZERO = 0.1;
const DO_MG_L_PER_VOLT = 6.25;
const OD_PER_VOLT = 0.9;

/** One paddlewheel mixes a raceway evenly up to about this; beyond it, split the pond. */
const MAX_MIXED_AREA_M2 = 12_000;
/** Gujarat average peak-sun hours, derated for dust and panel angle. */
const PEAK_SUN_H = 5 * 0.7;
const BUCK_EFFICIENCY = 0.85;

export function kitFor(areaM2: number, tier: string): Kit {
  if (tier === 'facility' || tier === 'mid') return 'industrial';
  return areaM2 < 5_000 ? 'basic' : 'standard';
}

/** One node per mixed loop — a raceway past ~12,000 m² is really two ponds. */
export function nodesForPond(areaM2: number): { nodes: number; because: string } {
  const nodes = Math.max(1, Math.ceil(areaM2 / MAX_MIXED_AREA_M2));
  return {
    nodes,
    because: nodes === 1
      ? 'A paddlewheel raceway is one mixed loop, so one well-sited probe represents it.'
      : `${Math.round(areaM2).toLocaleString('en-IN')} m² is more than one paddlewheel mixes evenly; `
        + `treat it as ${nodes} loops, one node each.`,
  };
}

export function nodeCircuit(kit: Kit): NodeCircuit {
  const parts: CircuitPart[] = [
    { ref: 'U1', part: 'ESP32-WROOM-32 DevKit', role: 'Reads probes, publishes over MQTT', bus: 'power', pin: null, qty: 1, unitInr: 450, supplyV: 3.3, drawMa: 80, duty: 1 },
    { ref: 'S1', part: kit === 'basic' ? 'Gravity analog pH kit (SEN0161-V2)' : 'Industrial pH electrode + signal board (SEN0169-V2)', role: 'pH', bus: 'ADC1', pin: 'GPIO34', qty: 1, unitInr: kit === 'basic' ? 2_900 : 4_800, supplyV: 5, drawMa: 5, duty: 1 },
    { ref: 'S2', part: 'DS18B20 waterproof probe + 4.7 kΩ pull-up', role: 'Water temperature', bus: 'OneWire', pin: 'GPIO4', qty: 1, unitInr: 190, supplyV: 3.3, drawMa: 1.5, duty: 1 },
    { ref: 'S3', part: '680 nm LED + BPW34 photodiode, 10 mm acrylic flow cell', role: 'Optical density (biomass)', bus: 'ADC1', pin: 'GPIO32', qty: 1, unitInr: 1_200, supplyV: 3.3, drawMa: 20, duty: 0.17 },
    { ref: 'M1', part: '12 V peristaltic pump + IRLZ44N MOSFET', role: 'Pulls a sample through the flow cell', bus: 'GPIO', pin: 'GPIO26', qty: 1, unitInr: 1_160, supplyV: 12, drawMa: 200, duty: 0.17 },
    { ref: 'K1', part: 'PC817 optocoupler off the contactor aux contact', role: 'Paddlewheel running', bus: 'GPIO', pin: 'GPIO27', qty: 1, unitInr: 25, supplyV: 3.3, drawMa: 0.5, duty: 1 },
    { ref: 'D1', part: 'LED + 330 Ω', role: 'Blinks on publish — field diagnostic', bus: 'GPIO', pin: 'GPIO13', qty: 1, unitInr: 5, supplyV: 3.3, drawMa: 10, duty: 0.02 },
    { ref: 'PS1', part: kit === 'basic' ? '10 W solar panel' : '20 W solar panel', role: 'Power', bus: 'power', pin: null, qty: 1, unitInr: kit === 'basic' ? 900 : 1_500, supplyV: null, drawMa: 0, duty: 0 },
    { ref: 'PS2', part: '12 V 7 Ah SMF battery', role: 'Carries the node through overcast days', bus: 'power', pin: null, qty: 1, unitInr: 1_300, supplyV: 12, drawMa: 0, duty: 0 },
    { ref: 'PS3', part: '10 A PWM solar charge controller', role: 'Charging', bus: 'power', pin: null, qty: 1, unitInr: 450, supplyV: 12, drawMa: 8, duty: 1 },
    { ref: 'PS4', part: 'LM2596 buck converter 12 V → 5 V', role: 'Logic supply', bus: 'power', pin: null, qty: 1, unitInr: 90, supplyV: 12, drawMa: 0, duty: 0 },
    { ref: 'E1', part: 'IP65 ABS enclosure, cable glands, PVC probe mount', role: 'Weatherproofing', bus: 'mechanical', pin: null, qty: 1, unitInr: 1_070, supplyV: null, drawMa: 0, duty: 0 },
  ];
  if (kit !== 'basic') {
    parts.push(
      { ref: 'S4', part: 'Galvanic dissolved-oxygen kit (SEN0237-A)', role: 'Dissolved oxygen', bus: 'ADC1', pin: 'GPIO35', qty: 1, unitInr: 16_500, supplyV: 5, drawMa: 5, duty: 1 },
      { ref: 'U2', part: 'SSD1306 0.96" OLED', role: 'Readable at the pond without a phone', bus: 'I2C', pin: 'GPIO21/22', qty: 1, unitInr: 220, supplyV: 3.3, drawMa: 15, duty: 1 },
      { ref: 'U3', part: 'PZEM-004T v3 energy meter', role: 'Paddlewheel kWh', bus: 'UART', pin: 'GPIO16/17', qty: 1, unitInr: 950, supplyV: 5, drawMa: 10, duty: 1 },
    );
  }
  if (kit === 'industrial') {
    parts.push(
      { ref: 'U4', part: 'Analog signal isolator board ×2 (pH, DO)', role: 'Stops ground loops through the water from corrupting readings', bus: 'power', pin: null, qty: 2, unitInr: 1_300, supplyV: 5, drawMa: 10, duty: 1 },
      { ref: 'U5', part: 'SX1276 LoRa module (Ra-02) + antenna', role: 'Long-range link to the site gateway', bus: 'SPI', pin: 'GPIO5/18/19/23', qty: 1, unitInr: 700, supplyV: 3.3, drawMa: 120, duty: 0.01 },
    );
  }

  const nets: Net[] = parts
    .filter((p) => p.pin)
    .map((p) => ({ from: `${p.ref}.OUT`, to: `U1.${p.pin}`, label: p.role }));
  nets.push(
    { from: 'PS1.+', to: 'PS3.PV+', label: 'Solar in' },
    { from: 'PS3.BAT+', to: 'PS2.+', label: 'Battery' },
    { from: 'PS3.LOAD+', to: 'PS4.IN+', label: '12 V bus' },
    { from: 'PS4.OUT+', to: 'U1.5V', label: '5 V logic' },
  );

  const avgMaAt12V = parts.reduce((s, p) => {
    if (!p.supplyV || p.drawMa === 0) return s;
    const at12 = p.supplyV === 12 ? p.drawMa : (p.drawMa * p.supplyV) / 12 / BUCK_EFFICIENCY;
    return s + at12 * p.qty * p.duty;
  }, 0);
  const dailyWh = (avgMaAt12V * 12 * 24) / 1000;
  const batteryAh = 7;
  const channels = parts.filter((p) => ['ADC1', 'OneWire', 'GPIO', 'UART'].includes(p.bus) && p.ref !== 'D1' && p.ref !== 'M1').map((p) => p.role);

  return {
    kit,
    channels,
    parts,
    nets,
    bomInr: parts.reduce((s, p) => s + p.qty * p.unitInr, 0),
    power: {
      avgMaAt12V: Math.round(avgMaAt12V),
      dailyWh: Math.round(dailyWh * 10) / 10,
      panelW: kit === 'basic' ? 10 : 20,
      batteryAh,
      // 50% depth of discharge for a lead-acid battery that should last.
      autonomyDays: Math.round(((batteryAh * 12 * 0.5) / dailyWh) * 10) / 10,
    },
    notes: [
      kit === 'basic'
        ? 'No dissolved-oxygen probe: at ₹16,500 it would cost more than the rest of the node. Crash warning falls back to pH swing and density.'
        : 'Dissolved oxygen is the leading crash indicator; its day-night swing flattens hours before density falls.',
      `Panel sized for ${PEAK_SUN_H.toFixed(1)} effective sun-hours; size for monsoon week, not the average.`,
      'Prices are Indian retail estimates for single units, not quotes.',
    ],
  };
}

export interface PinSignal { pin: string; channel: string; volts: number | null; raw: number; value: number | boolean; saturated: boolean }

/**
 * What the pins read for a given pond state — the inverse of the firmware's
 * conversions. A value outside the ADC's 0–3.3 V window saturates, exactly as
 * the real board would, and is flagged rather than silently clipped.
 */
export function signalsFor(r: { tempC: number; ph: number; doMgL: number | null; od: number; paddlewheelOn: boolean | null }): PinSignal[] {
  const adc = (pin: string, channel: string, volts: number, value: number): PinSignal => {
    const v = Math.min(V_REF, Math.max(0, volts));
    return { pin, channel, volts: Math.round(v * 1000) / 1000, raw: Math.round((v / V_REF) * ADC_MAX), value, saturated: v !== volts };
  };
  const phSlope = (10 - 4) / (PH_V_AT_PH10 - PH_V_AT_PH4);
  const out: PinSignal[] = [
    adc('GPIO34', 'pH', PH_V_AT_PH4 + (r.ph - 4) / phSlope, r.ph),
    adc('GPIO32', 'Optical density', r.od / OD_PER_VOLT, r.od),
    // DS18B20 reports 1/16 °C steps over OneWire; there is no voltage to show.
    { pin: 'GPIO4', channel: 'Water temperature', volts: null, raw: Math.round(r.tempC * 16), value: r.tempC, saturated: r.tempC < -55 || r.tempC > 125 },
  ];
  if (r.doMgL !== null) out.push(adc('GPIO35', 'Dissolved oxygen', r.doMgL / DO_MG_L_PER_VOLT + DO_V_AT_ZERO, r.doMgL));
  if (r.paddlewheelOn !== null) {
    out.push({ pin: 'GPIO27', channel: 'Paddlewheel running', volts: r.paddlewheelOn ? V_REF : 0, raw: r.paddlewheelOn ? 1 : 0, value: r.paddlewheelOn, saturated: false });
  }
  return out;
}
