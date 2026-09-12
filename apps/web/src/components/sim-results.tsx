import { mass, money } from '@/lib/display';
import type { SimInputs, SimResult } from '@/lib/simulation';

export function SimResults({ result, inputs, changed }: { result: SimResult; inputs: SimInputs; changed: boolean }) {
  const max = Math.max(1, ...result.daily.map((d) => d.co2Kg));
  // Fertiliser sales do not imply durable removal. Exclude the backend's
  // provisional carbon revenue from the illustrative operating balance.
  const balance = result.economics.biomassRevenueInr - result.economics.totalCostInr;
  return <div aria-label="Simulation results">
    {changed && <p className="sim-notice" role="status">You changed the settings. These results are from the previous run. Calculate again to update them.</p>}
    <section className="panel"><p className="eyebrow">YOUR ESTIMATE</p><h2>What this pond could produce</h2><p className="sub">{inputs.areaM2.toLocaleString('en-IN')} m² pond · {Math.round(inputs.depthM * 100)} cm deep · {inputs.days} days</p>
      <div className="sim-totals"><div><span>Estimated carbon dioxide absorbed</span><strong className="num">{mass(result.totals.co2Kg)}</strong></div><div><span>Estimated dry algae harvested</span><strong className="num">{mass(result.totals.harvestedDryKg)}</strong></div></div>
      <figure className="chart"><svg viewBox="0 0 600 150" role="img" aria-label={`Estimated daily carbon absorption over ${inputs.days} days. Total ${mass(result.totals.co2Kg)}. Daily values are in the expandable table below.`} preserveAspectRatio="none">
        <line x1="0" y1="145" x2="600" y2="145" stroke="#d9e2d8" />
        {result.daily.map((d) => { const w = 600 / result.daily.length; const h = Math.max(0, d.co2Kg) / max * 135; return <rect key={d.day} x={(d.day - 1) * w} y={145 - h} width={Math.max(1, w - 2)} height={h} rx="2" fill="#468358"><title>Day {d.day}: {mass(d.co2Kg)}</title></rect>; })}
      </svg><figcaption><span>Day 1</span><span>Daily carbon dioxide absorbed</span><span>Day {inputs.days}</span></figcaption></figure>
      <p className="helper page-note">This is a model estimate, not a promise of production or a carbon credit.</p>
      <details className="technical"><summary>Daily results and model details</summary><dl className="kv"><dt>Sunlight model limit</dt><dd>{mass(result.totals.ceilingCo2Kg)}</dd><dt>Dry algae per m² each day</dt><dd>{result.totals.yieldGPerM2PerDay} grams</dd><dt>Latitude used</dt><dd>{inputs.latDeg}°</dd></dl><div className="table-scroll"><table><caption>Estimated production each day</caption><thead><tr><th>Day</th><th>Carbon absorbed</th><th>Water temperature</th></tr></thead><tbody>{result.daily.map((d) => <tr key={d.day}><td>{d.day}</td><td>{mass(d.co2Kg)}</td><td>{d.temperatureC.toFixed(1)} °C</td></tr>)}</tbody></table></div></details>
    </section>
    <section className="panel"><h2>Could it cover its running costs?</h2><p className="sub">Illustrative costs and algae sales for the same {inputs.days} days.</p><dl className="kv"><dt>Electricity</dt><dd>{money(result.economics.energyCostInr)}</dd><dt>Harvesting and drying</dt><dd>{money(result.economics.harvestCostInr)}</dd><dt>Labour</dt><dd>{money(result.economics.labourCostInr)}</dd><dt>Total running costs</dt><dd><strong>{money(result.economics.totalCostInr)}</strong></dd><dt>Income from algae sales</dt><dd>{money(result.economics.biomassRevenueInr)}</dd></dl>
      <div className={`net ${balance < 0 ? 'is-negative' : ''}`}><span>{balance < 0 ? 'Estimated shortfall' : 'Estimated surplus'}</span><strong className="num">{money(Math.abs(balance))}</strong></div><p className="helper">{balance < 0 ? 'Algae sales alone would not cover these running costs.' : 'Estimated algae sales exceed these running costs.'} Setup costs and any wastewater-treatment income are not included.</p>
      <p className="helper">Carbon-credit income is excluded. Selling algae as fertiliser does not establish permanent carbon storage.</p>
      <details className="technical"><summary>See the assumptions behind these costs</summary><p>{result.economics.note}</p><dl className="kv">{Object.entries(result.economics.assumptions).filter(([key]) => key !== 'creditInrPerTonne').map(([key, value]) => <div style={{ display: 'contents' }} key={key}><dt>{{ biofertiliserInrPerKg: 'Algae sale price (₹/kg)', paddlewheelWPerM2: 'Mixing power (watts/m²)', tariffInrPerKwh: 'Electricity price (₹/kWh)', labourInrPerDay: 'Labour (₹/day)' }[key] ?? key}</dt><dd>{value.toLocaleString('en-IN')}</dd></div>)}</dl></details>
    </section>
  </div>;
}
