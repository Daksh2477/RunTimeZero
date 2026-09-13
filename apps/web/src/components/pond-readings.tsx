'use client';
import { useEffect, useRef, useState } from 'react';
import type { PondDetail } from '@/lib/api';
import { readingTime } from '@/lib/display';
import { useLiveStream } from '@/lib/use-live-stream';

type Point = PondDetail['telemetry'][number];

/**
 * The pond's reading cards, fed by the live stream.
 *
 * Values change in place — no remount, no page refresh — so a new reading
 * eases in instead of flashing the whole panel. The server-rendered history
 * seeds it, and the table below keeps the last dozen readings as they arrive.
 */
export function PondReadings({ telemetry, pondId }: { telemetry: PondDetail['telemetry']; pondId: string }) {
  const live = useLiveStream({ pondId });
  const [history, setHistory] = useState<Point[]>(telemetry);
  const lastAt = useRef(telemetry.at(-1)?.observedAt ?? '');

  const incoming = live.readings.find((r) => r.pondId === pondId);
  useEffect(() => {
    if (!incoming || incoming.at === lastAt.current) return;
    lastAt.current = incoming.at;
    const point = {
      ...(history.at(-1) ?? {}),
      observedAt: incoming.at,
      temperatureC: incoming.readings.tempC,
      ph: incoming.readings.ph,
      dissolvedOxygenMgL: incoming.readings.doMgL,
      opticalDensity: incoming.readings.od,
    } as Point;
    setHistory((h) => [...h.slice(-47), point]);
  }, [incoming, history]);

  const last = history.at(-1);
  const readings = [
    { title: 'Water temperature', value: last?.temperatureC, unit: '°C', help: 'How warm the pond water is.' },
    { title: 'Water acidity (pH)', value: last?.ph, unit: '', help: 'Lower numbers mean more acidic water.' },
    { title: 'Oxygen in the water', value: last?.dissolvedOxygenMgL, unit: 'mg/L', help: 'Oxygen dissolved in each litre of water.' },
    { title: 'Algae density', value: last?.opticalDensity, unit: 'OD', help: 'A sensor reading of how cloudy the algae makes the water.' },
  ];
  const state = live.connection === 'live' ? 'Live' : live.connection === 'polling' ? 'Updating every 5 s' : live.connection === 'paused' ? 'Paused' : live.connection === 'offline' ? 'Offline' : 'Connecting…';
  return <section className="panel"><div className="section-heading"><h2>Latest water readings</h2><span className={`live-indicator ${live.connection}`}><span aria-hidden="true">●</span> {state}</span></div><p className="sub">Recorded: {readingTime(last?.observedAt)}</p>
    <div className="readings-grid">{readings.map((r) => <div className="reading-card" key={r.title}><h3>{r.title}</h3><strong className="num" style={{ transition: 'color .6s ease' }}>{r.value == null || !Number.isFinite(r.value) ? 'No reading' : `${r.value.toFixed(1)} ${r.unit}`}</strong><p>{r.help}</p></div>)}</div>
    {history.length > 0 && <details className="technical"><summary>See recent readings</summary><div className="table-scroll"><table><caption>Latest 12 readings, in India Standard Time</caption><thead><tr><th>Time</th><th>Temperature</th><th>pH</th><th>Oxygen</th></tr></thead><tbody>{history.slice(-12).reverse().map((t, i) => <tr key={`${t.observedAt}-${i}`}><td>{readingTime(t.observedAt)}</td><td>{t.temperatureC == null ? 'No reading' : `${t.temperatureC.toFixed(1)} °C`}</td><td>{t.ph?.toFixed(1) ?? 'No reading'}</td><td>{t.dissolvedOxygenMgL == null ? 'No reading' : `${t.dissolvedOxygenMgL.toFixed(1)} mg/L`}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
