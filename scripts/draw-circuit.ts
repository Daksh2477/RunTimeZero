/**
 * Draw the sensor node circuit as a slide-ready SVG, from the same part list
 * the API serves, so the diagram cannot drift from the product.
 *
 *   npm run draw:circuit      → apps/web/public/circuit/node-<kit>.svg
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { nodeCircuit, type Kit } from '../apps/api/src/services/circuit.ts';

const OUT = new URL('../apps/web/public/circuit/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const COLOR: Record<string, string> = {
  ADC1: '#0e7c66', OneWire: '#b7791f', GPIO: '#2b6cb0', I2C: '#805ad5', UART: '#c05621', SPI: '#d53f8c', power: '#c53030',
};

function draw(kit: Kit): string {
  const c = nodeCircuit(kit);
  const W = 1600;
  const H = 1100;
  const signal = c.parts.filter((p) => p.pin);
  const power = c.parts.filter((p) => !p.pin && p.bus === 'power' && p.ref !== 'U1');
  const left = signal.filter((_, i) => i % 2 === 0);
  const right = signal.filter((_, i) => i % 2 === 1);
  const mcu = { x: 640, y: 170, w: 320, h: 520 };
  const out: string[] = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter,Segoe UI,Arial,sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  out.push(`<text x="40" y="56" font-size="30" font-weight="700" fill="#10231c">AlgaCarbon sensor node — ${kit} kit</text>`);
  out.push(`<text x="40" y="90" font-size="17" fill="#4a5a54">One device per pond loop · ESP32 · ${c.channels.length} channels · BOM ₹${c.bomInr.toLocaleString('en-IN')} · ${c.power.dailyWh} Wh/day · ${c.power.autonomyDays} days on battery</text>`);

  out.push(`<rect x="${mcu.x}" y="${mcu.y}" width="${mcu.w}" height="${mcu.h}" rx="18" fill="#10231c"/>`);
  out.push(`<text x="${mcu.x + mcu.w / 2}" y="${mcu.y + 44}" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">U1 · ESP32-WROOM-32</text>`);
  out.push(`<text x="${mcu.x + mcu.w / 2}" y="${mcu.y + 72}" font-size="15" fill="#9fd9c3" text-anchor="middle">Signs each reading (HMAC-SHA256)</text>`);

  const side = (parts: typeof signal, isLeft: boolean) => {
    const gap = mcu.h / (parts.length + 1);
    parts.forEach((p, i) => {
      const py = mcu.y + gap * (i + 1);
      const bx = isLeft ? 60 : 1180;
      const bw = 360;
      const pinX = isLeft ? mcu.x : mcu.x + mcu.w;
      const col = COLOR[p.bus] ?? '#333';
      out.push(`<rect x="${bx}" y="${py - 38}" width="${bw}" height="76" rx="10" fill="#f4f8f6" stroke="${col}" stroke-width="2"/>`);
      out.push(`<text x="${bx + 14}" y="${py - 12}" font-size="16" font-weight="700" fill="#10231c">${p.ref} · ${esc(p.role)}</text>`);
      out.push(`<text x="${bx + 14}" y="${py + 10}" font-size="13" fill="#4a5a54">${esc(p.part.slice(0, 46))}</text>`);
      out.push(`<text x="${bx + 14}" y="${py + 29}" font-size="13" fill="${col}">${p.bus} · ${p.supplyV ?? ''}V · ₹${p.unitInr.toLocaleString('en-IN')}</text>`);
      const x1 = isLeft ? bx + bw : bx;
      out.push(`<line x1="${x1}" y1="${py}" x2="${pinX}" y2="${py}" stroke="${col}" stroke-width="3"/>`);
      out.push(`<circle cx="${pinX}" cy="${py}" r="6" fill="${col}"/>`);
      out.push(`<text x="${isLeft ? pinX + 12 : pinX - 12}" y="${py + 5}" font-size="15" fill="#fff" text-anchor="${isLeft ? 'start' : 'end'}">${p.pin}</text>`);
    });
  };
  side(left, true);
  side(right, false);

  // Power chain along the bottom.
  const py = 780;
  out.push(`<text x="60" y="${py - 30}" font-size="18" font-weight="700" fill="#c53030">Power</text>`);
  const chain = power.filter((p) => p.ref.startsWith('PS'));
  chain.forEach((p, i) => {
    const x = 60 + i * 280;
    out.push(`<rect x="${x}" y="${py}" width="240" height="70" rx="10" fill="#fff5f5" stroke="#c53030" stroke-width="2"/>`);
    out.push(`<text x="${x + 12}" y="${py + 28}" font-size="15" font-weight="700" fill="#10231c">${p.ref}</text>`);
    out.push(`<text x="${x + 12}" y="${py + 50}" font-size="12" fill="#4a5a54">${esc(p.part.slice(0, 34))}</text>`);
    if (i > 0) out.push(`<line x1="${x - 40}" y1="${py + 35}" x2="${x}" y2="${py + 35}" stroke="#c53030" stroke-width="3" marker-end="url(#a)"/>`);
  });
  // Buck output (last box) feeds the ESP32 straight up — no crossings.
  const feedX = mcu.x + mcu.w - 40;
  out.push(`<path d="M${60 + (chain.length - 1) * 280 + 120} ${py} V${py - 40} H${feedX} V${mcu.y + mcu.h}" fill="none" stroke="#c53030" stroke-width="3"/>`);
  out.push(`<text x="${feedX + 12}" y="${mcu.y + mcu.h + 30}" font-size="14" fill="#c53030">5 V / 3.3 V</text>`);

  // Data path to the dashboard.
  const steps = ['ESP32 (Wi-Fi / LoRa)', 'MQTT broker', 'AlgaCarbon API', 'Live dashboard'];
  const dy = 1010;
  steps.forEach((s, i) => {
    const x = 60 + i * 300;
    out.push(`<rect x="${x}" y="${dy - 26}" width="250" height="52" rx="26" fill="#e6f4ee" stroke="#0e7c66" stroke-width="2"/>`);
    out.push(`<text x="${x + 125}" y="${dy + 5}" font-size="15" font-weight="600" fill="#10231c" text-anchor="middle">${s}</text>`);
    if (i > 0) out.push(`<line x1="${x - 50}" y1="${dy}" x2="${x}" y2="${dy}" stroke="#0e7c66" stroke-width="3" marker-end="url(#g)"/>`);
  });
  out.push(`<text x="60" y="${dy - 44}" font-size="18" font-weight="700" fill="#0e7c66">Device → dashboard: signed reading every 30 s → verified → stored → streamed live</text>`);

  out.push(`<defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#c53030"/></marker><marker id="g" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#0e7c66"/></marker></defs>`);
  out.push('</svg>');
  return out.join('\n');
}

for (const kit of ['basic', 'standard', 'industrial'] as Kit[]) {
  writeFileSync(new URL(`node-${kit}.svg`, OUT), draw(kit));
  console.log(`apps/web/public/circuit/node-${kit}.svg`);
}
