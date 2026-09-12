'use client';

/**
 * The pond, seen from above.
 *
 * WHY THIS IS NOT 3D
 *
 * The people this is for are on cheap Android phones on rural data. A WebGL
 * library is ~600 KB against a 33 KB physics engine, and on a five-inch screen
 * a tilted 3D pond is harder to read than a flat one, not easier. Everything
 * here is 2D canvas and about 9 KB: it runs anywhere, and it shows more.
 *
 * Every visual element is driven by a real simulated quantity. Nothing here is
 * decorative motion — if the water darkens, the culture genuinely thickened;
 * if the paddlewheel stops, the pond is genuinely unmixed. A pretty animation
 * that does not track the model would undermine the one thing this project
 * claims, which is that its numbers mean something.
 */

import { useEffect, useRef } from 'react';
import type { DayPoint } from '@/lib/twin';
import { drawPond, drawSensors } from '@/lib/pond-draw';

export interface PondViewProps {
  /** Daily trace from the twin. The animation plays along it. */
  daily: DayPoint[];
  areaM2: number;
  /** False once a paddlewheel fault is injected. */
  mixing: boolean;
  /** Where the operator has placed probes, in pond-relative 0..1 coords. */
  sensors: { id: string; x: number; y: number; label: string }[];
  onMoveSensor?: (id: string, x: number, y: number) => void;
  /** Which day to show. Animation interpolates between whole days. */
  day: number;
}

/** Raceway proportions — real ponds run about 1:7.5 to circulate evenly. */
const ASPECT = 7.5 / 1;

export function PondView({
  daily, areaM2, mixing, sensors, onMoveSensor, day,
}: PondViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<string | null>(null);
  // Read by the animation loop without re-subscribing it on every render.
  const state = useRef({ daily, mixing, sensors, day, areaM2 });
  state.current = { daily, mixing, sensors, day, areaM2 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t0 = performance.now();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = (now: number) => {
      const { daily: d, mixing: mix, sensors: sens, day: dayIdx } = state.current;
      const elapsed = reduced ? 0 : (now - t0) / 1000;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth;
      const cssH = cssW / ASPECT + 56;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        canvas.style.height = `${cssH}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const point = d[Math.min(d.length - 1, Math.max(0, Math.floor(dayIdx)))];
      const od = point?.opticalDensity ?? 0.2;
      const phase = point ? Math.max(0, Math.min(1, (point.ph - 6.5) / 2.5)) : 0.6;
      // A pond whose pH has collapsed is a pond whose cells are dying.
      const health = point ? Math.max(0.15, Math.min(1, phase + 0.35)) : 1;

      drawPond(ctx, cssW, cssH, { od, health, mixing: mix, elapsed, point });
      drawSensors(ctx, cssW, cssH, sens);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* Sensor dragging. Pointer events cover mouse and touch in one path. */
  const toPond = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const padX = r.width * 0.04;
    const top = 28;
    const h = r.width / ASPECT;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left - padX) / (r.width - padX * 2))),
      y: Math.max(0, Math.min(1, (e.clientY - r.top - top) / h)),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!onMoveSensor) return;
    const { x, y } = toPond(e);
    let best: { id: string; d: number } | null = null;
    for (const s of sensors) {
      const dist = Math.hypot((s.x - x) * ASPECT, s.y - y);
      if (!best || dist < best.d) best = { id: s.id, d: dist };
    }
    // Generous radius: fingers are not precise and the pond is short.
    if (best && best.d < 1.2) {
      dragging.current = best.id;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current || !onMoveSensor) return;
    const { x, y } = toPond(e);
    onMoveSensor(dragging.current, x, y);
  };

  const onUp = () => { dragging.current = null; };

  return (
    <canvas
      ref={canvasRef}
      className="pond-view"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="img"
      aria-label={
        `Top-down view of a ${Math.round(areaM2).toLocaleString('en-IN')} square metre pond. ` +
        `Paddlewheel ${mixing ? 'running' : 'stopped'}.`
      }
    />
  );
}
