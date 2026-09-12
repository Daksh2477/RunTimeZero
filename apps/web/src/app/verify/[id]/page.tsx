import Link from 'next/link';
import { getReport } from '@/lib/api';
import { channelLabel, dateLabel, mass, statusInfo } from '@/lib/display';
import { CarbonComparison, EmptyState, StatusBadge } from '@/components/ui';
import { RefreshControls } from '@/components/refresh-controls';
export const dynamic = 'force-dynamic';

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getReport(id);
  if (!c) return <main className="wrap"><Link className="back" href="/verify">← All carbon reports</Link><EmptyState title="We couldn’t open this report"><p>Check the reference and try again. The record may not exist, or the connection may be unavailable.</p><RefreshControls /></EmptyState></main>;
  const s = statusInfo(c.verdict);
  return <main className="wrap"><Link className="back" href="/verify">← All carbon reports</Link><div className="page-heading"><div><p className="eyebrow">CARBON REPORT</p><h1>{c.pond.label} · Carbon check</h1><p>{c.site.name} · {dateLabel(c.window.start)} – {dateLabel(c.window.end)}</p></div><StatusBadge verdict={c.verdict} /></div>
    <div className="detail-grid"><div><section className={`result-hero ${s.tone}`}><p>Carbon supported by this check</p><strong className="result-number num">{mass(c.creditableCo2Kg)}</strong><p>{s.detail}</p><p className="helper">This amount is carbon dioxide (CO₂). It is not a certificate or an issued credit.</p></section>
      <section className="panel"><h2>The result, explained</h2><p className="sub">The farm reports one amount. The check compares it with available evidence.</p><CarbonComparison claimed={c.claimedCo2Kg} supported={c.creditableCo2Kg} />
        <details className="technical"><summary>Show calculations and detailed notes</summary><dl className="kv"><dt>Evidence estimate range</dt><dd>{mass(c.independentLowCo2Kg)} – {mass(c.independentHighCo2Kg)}</dd><dt>Sunlight model limit</dt><dd>{mass(c.ceilingCo2Kg)}</dd><dt>Method</dt><dd>{c.method ?? 'Earlier prototype method'}</dd></dl><p>{c.reason}</p><p className="helper">The sunlight limit depends on the model’s assumptions. New reports cap supported capture at the lower end of the evidence estimate; legacy reports may use an earlier rule.</p></details>
      </section></div><div><section className="panel"><h2>Records behind the result</h2><p className="sub">{c.evidenceStatus === 'recorded_snapshot' ? 'These records were saved when this check was made.' : 'This older report does not have a saved copy of its evidence.'}</p>
        {c.sources.length === 0 && c.harvests.length === 0 ? <p>No saved source records are available in this report.</p> : <ul className="evidence-list">{c.sources.map((r, i) => <li key={`${r.ref}-${i}`}><strong>{channelLabel(r.channel)}</strong><span>{dateLabel(r.observedAt)}</span><details><summary>View reference</summary><p className="reference">{r.ref}</p></details></li>)}{c.harvests.map((h, i) => <li key={`${h.harvestedAt}-${i}`}><strong>Weighed harvest · {mass(h.dryMassKg)}</strong><span>{dateLabel(h.harvestedAt)}</span><small className="reference">{h.ref ?? 'No reference supplied'}</small></li>)}</ul>}
        <p className="helper">Source references can include simulated records. A recorded reference alone does not prove its authenticity.</p>
      </section><section className="panel"><h2>About this report</h2><dl className="kv"><dt>Checked on</dt><dd>{dateLabel(c.computedAt)}</dd><dt>Pond size</dt><dd>{c.pond.areaM2.toLocaleString('en-IN')} m²</dd></dl><details className="technical"><summary>Report reference and saved inputs</summary><p className="reference">{c.checkId}</p><pre>{JSON.stringify(c.inputs ?? { note: 'This legacy report has no saved input snapshot.' }, null, 2)}</pre></details></section></div></div>
  </main>;
}
