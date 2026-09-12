import Link from 'next/link';
import { RelatedLinks, Breadcrumbs } from '@/components/related-links';
import { getPond } from '@/lib/api';
import { channelLabel, dateLabel, mass, money, statusInfo } from '@/lib/display';
import { CarbonComparison, EmptyState, StatusBadge } from '@/components/ui';
import { PondReadings } from '@/components/pond-readings';
import { RefreshControls } from '@/components/refresh-controls';
import { CheckPeriod } from '@/components/check-period';
export const dynamic = 'force-dynamic';

export default async function PondPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPond(id);
  if (!data) return <main className="wrap"><Link className="back" href="/console">← Back to my ponds</Link><EmptyState title="We couldn’t load this pond"><p>The pond may not exist, or its connection is temporarily unavailable.</p><RefreshControls /></EmptyState></main>;
  const { pond, telemetry, observations, harvests, advisories, latestCheck } = data;
  const verdict = latestCheck ? String(latestCheck.verdict) : null;
  const status = statusInfo(verdict);
  const value = (key: string) => latestCheck?.[key] == null ? null : Number(latestCheck[key]);
  return <main className="wrap">
    <Link className="back" href="/console">← Back to my ponds</Link>
    <div className="page-heading"><div><p className="eyebrow">POND DETAILS</p><h1>{pond.label}</h1><p>{pond.siteName} · {pond.areaM2.toLocaleString('en-IN')} square metres</p></div><div className="heading-actions"><Link className="button secondary" href={`/sim?pond=${id}`}>Plan ahead →</Link><RefreshControls auto /></div></div>
    <RelatedLinks pondId={id} siteId={pond.siteId} checkId={latestCheck?.id ? String(latestCheck.id) : undefined}/><Breadcrumbs items={[{href:"/farm",label:"My ponds"},{href:`/console/site/${pond.siteId}`,label:pond.siteName},{href:`/console/pond/${id}`,label:pond.label}]}/>
    <div className="detail-grid">
      <div><section className="panel"><div className="section-heading"><h2>Carbon check</h2><StatusBadge verdict={verdict} /></div><p className="sub">{status.detail}</p>
        {latestCheck ? <><p className="period-label">{dateLabel(String(latestCheck.window_start))} – {dateLabel(String(latestCheck.window_end))}</p><CarbonComparison claimed={value('claimed_co2_kg')} supported={value('creditable_co2_kg')} />
          {latestCheck.id && <Link className="button secondary" href={`/verify/${latestCheck.id}`}>Open full carbon report →</Link>}
          <details className="technical"><summary>See the calculation and check notes</summary><dl className="kv"><dt>Evidence estimate range</dt><dd>{mass(value('independent_low_co2_kg'))} – {mass(value('independent_high_co2_kg'))}</dd><dt>Sunlight model limit</dt><dd>{mass(value('ceiling_co2_kg'))}</dd></dl><p>{String(latestCheck.reason)}</p><p className="helper">New reports use the evidence lower bound. Older prototype reports may use an earlier method.</p></details>
        </> : <div className="inline-empty"><p>No carbon report yet. Sensor readings alone do not confirm carbon capture.</p><p>Use “Check a different period” below once readings and supporting records are available.</p></div>}
      </section><PondReadings telemetry={telemetry} /><CheckPeriod pondId={id} /></div>
      <div><section className="panel action-panel"><p className="eyebrow">NEXT STEPS</p><h2>{advisories.length ? `${advisories.length} pond ${advisories.length === 1 ? 'alert' : 'alerts'} to review` : 'Keep an eye on your pond'}</h2><p className="sub">Suggestions based on the available readings. Check conditions on site before acting.</p>
        {!advisories.length && <p>{telemetry.length < 2 ? 'More readings are needed before we can suggest next steps.' : 'No alerts were found in the available readings. Continue your usual checks.'}</p>}
        {advisories.map((a) => <article className="advisory" key={a.kind}><div className="advisory-head"><span className={`verdict ${a.severity === 'critical' ? 'flagged' : a.severity === 'warning' ? 'watch' : 'none'}`}>{a.severity === 'critical' ? 'Urgent' : a.severity === 'warning' ? 'Check soon' : 'Suggestion'}</span>{a.hoursToAct !== null && <span className="helper">Suggested action within {a.hoursToAct} hours</span>}</div><h3>{a.title}</h3><p>{a.action}</p><details><summary>Why this was suggested</summary><p>{a.detail}</p>{a.costOfActingInr !== null && <p>Rough cost to act: {money(a.costOfActingInr)}</p>}</details></article>)}
      </section>
      <details className="panel evidence-details"><summary>Farm records and evidence</summary><p className="helper">Recent records available for this pond. A carbon report keeps its own evidence snapshot.</p>
        {!observations.length && !harvests.length && <p>No evidence records received yet.</p>}
        <ul className="evidence-list">{observations.slice(-5).map((o, i) => <li key={`${o.sourceRef}-${i}`}><strong>{channelLabel(o.channel)}</strong><span>{dateLabel(o.observedAt)}</span><small className="reference">{o.sourceRef}</small></li>)}{harvests.slice(-5).map((h, i) => <li key={`${h.harvestedAt}-${i}`}><strong>Weighed harvest · {mass(h.dryMassKg)} dry algae</strong><span>{dateLabel(h.harvestedAt)}</span></li>)}</ul>
      </details></div>
    </div>
  </main>;
}
