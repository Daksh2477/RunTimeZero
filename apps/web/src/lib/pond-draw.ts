/**
 * Canvas drawing for the top-down pond.
 *
 * Split from the React component so the component handles state and this
 * handles pixels. Everything is plain 2D canvas — no dependency, ~9 KB, and
 * it runs on any phone that can open the page at all.
 *
 * The drawing order is the physical order: earth, water, culture, surface
 * motion, then hardware on top. Doing it in that sequence is why the pond
 * reads as a pond rather than as a stack of shapes.
 */

import type { DayPoint } from './twin';

const ASPECT = 7.5;

export interface Scene {
  od: number;
  /** 0..1. Below 1 the culture browns the way degrading chlorophyll does. */
  health: number;
  mixing: boolean;
  elapsed: number;
  point: DayPoint | undefined;
}

function cultureColour(od: number, health: number, shade = 0): string {
  const t = Math.min(1, Math.max(0, od / 0.6));
  const h = 78 - t * 18 - (1 - health) * 46;
  const s = 30 + t * 32 - (1 - health) * 14;
  const l = 62 - t * 30 - shade;
  return `hsl(${h} ${s}% ${l}%)`;
}

/** Rounded rectangle, for the pond basin and the liner. */
function basin(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawPond(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  scene: Scene,
) {
  const padX = cssW * 0.04;
  const top = 28;
  const w = cssW - padX * 2;
  const h = w / ASPECT;
  const { od, health, mixing, elapsed } = scene;

  // --- earth around the basin ---------------------------------------------
  ctx.fillStyle = '#e7e2d6';
  basin(ctx, padX - 10, top - 10, w + 20, h + 20, 18);
  ctx.fill();

  // --- water, darkening with depth -----------------------------------------
  const grad = ctx.createLinearGradient(0, top, 0, top + h);
  grad.addColorStop(0, cultureColour(od, health, 0));
  grad.addColorStop(1, cultureColour(od, health, 12));
  ctx.fillStyle = grad;
  basin(ctx, padX, top, w, h, 12);
  ctx.fill();

  ctx.save();
  basin(ctx, padX, top, w, h, 12);
  ctx.clip();

  // --- the central divider that makes a raceway a raceway ------------------
  ctx.fillStyle = '#ded8c9';
  const divW = w * 0.72;
  ctx.fillRect(padX + w * 0.14, top + h * 0.44, divW, h * 0.12);

  // --- circulation: the culture is carried around the loop -----------------
  // Streaks rather than particles: a raceway moves as a body of water, and
  // drifting dots would read as debris.
  const speed = mixing ? 1 : 0.05;
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = cultureColour(od, health, -14);
  ctx.lineWidth = Math.max(1.5, h * 0.035);
  ctx.lineCap = 'round';
  for (let i = 0; i < 14; i += 1) {
    const lane = i % 2 === 0 ? top + h * 0.22 : top + h * 0.78;
    const dir = i % 2 === 0 ? 1 : -1;
    const span = w * 0.1;
    const x = padX + ((i * w) / 14 + dir * elapsed * speed * w * 0.08 + w) % w;
    ctx.beginPath();
    ctx.moveTo(x, lane);
    ctx.lineTo(Math.min(padX + w, x + span), lane);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- surface ripple, only while something is pushing the water -----------
  if (mixing) {
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const y = top + h * (0.3 + i * 0.2)
          + Math.sin((x / w) * 9 + elapsed * 2 + i) * (h * 0.012);
        if (x === 0) ctx.moveTo(padX + x, y); else ctx.lineTo(padX + x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  drawPaddlewheel(ctx, padX + w * 0.07, top + h / 2, h * 0.42, mixing, elapsed);

  // --- basin edge ----------------------------------------------------------
  ctx.strokeStyle = 'rgba(24,53,43,0.28)';
  ctx.lineWidth = 1.5;
  basin(ctx, padX, top, w, h, 12);
  ctx.stroke();

  drawStatus(ctx, padX, top, w, scene);
}

/**
 * The paddlewheel, turning at a rate the operator can read.
 *
 * When mixing stops it does not just freeze — it slows and settles, because a
 * wheel that vanishes mid-frame reads as a rendering glitch rather than as a
 * fault. A stopped wheel also goes rust-coloured, which is the same colour the
 * alert uses.
 */
function drawPaddlewheel(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  mixing: boolean, elapsed: number,
) {
  const angle = elapsed * (mixing ? 1.6 : 0);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = mixing ? '#4a5d55' : '#a33c27';
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = mixing ? '#4a5d55' : '#a33c27';
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(3, r * 0.2), 0, Math.PI * 2);
  ctx.fill();
}

/** Day number, density and the mixing warning, above the water. */
function drawStatus(
  ctx: CanvasRenderingContext2D,
  x: number, top: number, w: number, scene: Scene,
) {
  const { point, mixing, od } = scene;
  ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#52665c';
  ctx.textAlign = 'left';
  ctx.fillText(point ? `Day ${point.day}` : 'Day —', x, top - 14);

  ctx.textAlign = 'right';
  if (!mixing) {
    ctx.fillStyle = '#a33c27';
    ctx.fillText('paddlewheel stopped', x + w, top - 14);
  } else {
    ctx.fillStyle = '#52665c';
    ctx.fillText(`density ${od.toFixed(2)}`, x + w, top - 14);
  }
}

/** Probes the operator has dropped on the pond. */
export function drawSensors(
  ctx: CanvasRenderingContext2D,
  cssW: number, cssH: number,
  sensors: { id: string; x: number; y: number; label: string }[],
) {
  const padX = cssW * 0.04;
  const top = 28;
  const w = cssW - padX * 2;
  const h = w / ASPECT;

  for (const s of sensors) {
    const px = padX + s.x * w;
    const py = top + s.y * h;

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#18352b';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#18352b';
    ctx.fillText(s.label, px, py + 22);
  }
}
