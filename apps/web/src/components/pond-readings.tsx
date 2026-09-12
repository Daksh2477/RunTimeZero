import type { PondDetail } from '@/lib/api';
import { readingTime } from '@/lib/display';
export function PondReadings({ telemetry }: { telemetry: PondDetail['telemetry'] }) {
  const last = telemetry.at(-1);
  const readings = [
    { title: 'Water temperature', value: last?.temperatureC, unit: '°C', help: 'How warm the pond water is.' },
    { title: 'Water acidity (pH)', value: last?.ph, unit: '', help: 'Lower numbers mean more acidic water.' },
    { title: 'Oxygen in the water', value: last?.dissolvedOxygenMgL, unit: 'mg/L', help: 'Oxygen dissolved in each litre of water.' },
    { title: 'Algae density', value: last?.opticalDensity, unit: 'OD', help: 'A sensor reading of how cloudy the algae makes the water.' },
  ];
  return <section className="panel"><h2>Latest water readings</h2><p className="sub">Recorded: {readingTime(last?.observedAt)}</p>
    <div className="readings-grid">{readings.map((r) => <div className="reading-card" key={r.title}><h3>{r.title}</h3><strong className="num">{r.value == null || !Number.isFinite(r.value) ? 'No reading' : `${r.value.toFixed(1)} ${r.unit}`}</strong><p>{r.help}</p></div>)}</div>
    {telemetry.length > 0 && <details className="technical"><summary>See recent readings</summary><div className="table-scroll"><table><caption>Latest 12 readings, in India Standard Time</caption><thead><tr><th>Time</th><th>Temperature</th><th>pH</th><th>Oxygen</th></tr></thead><tbody>{telemetry.slice(-12).reverse().map((t, i) => <tr key={`${t.observedAt}-${i}`}><td>{readingTime(t.observedAt)}</td><td>{t.temperatureC == null ? 'No reading' : `${t.temperatureC.toFixed(1)} °C`}</td><td>{t.ph?.toFixed(1) ?? 'No reading'}</td><td>{t.dissolvedOxygenMgL == null ? 'No reading' : `${t.dissolvedOxygenMgL.toFixed(1)} mg/L`}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
