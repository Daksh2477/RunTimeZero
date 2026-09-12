import Link from 'next/link';
import { getReports } from '@/lib/api';
import { dateLabel, mass } from '@/lib/display';
import { EmptyState, StatusBadge } from '@/components/ui';
import { ReportLookup } from '@/components/report-lookup';
import { RefreshControls } from '@/components/refresh-controls';
export const dynamic = 'force-dynamic';

export default async function VerifyIndex() {
  const rows = await getReports();
  return <main className="wrap"><div className="page-heading"><div><p className="eyebrow">CARBON REPORTS</p><h1>See what the evidence says.</h1><p>Compare the farm’s reported carbon capture with the amount supported by its records.</p></div></div>
    <ReportLookup />
    <div className="section-heading"><div><h2>Recent reports</h2><p>Open any report to see the result and the records behind it.</p></div><RefreshControls /></div>
    {!rows ? <EmptyState title="Reports are temporarily unavailable"><p>We couldn’t reach the records. Please refresh to try again.</p></EmptyState>
      : rows.length === 0 ? <EmptyState title="No carbon reports yet"><p>Open a pond and choose a period to create its first report.</p><Link className="button" href="/console">Go to my ponds →</Link></EmptyState>
      : <div className="report-list">{rows.map((r) => <Link className="report-card" href={`/verify/${r.checkId}`} key={r.checkId}><div><StatusBadge verdict={r.verdict} /><h3>{r.pondLabel}</h3><p>{r.siteName}</p><small>Checked {dateLabel(r.computedAt)}</small></div><div className="report-amount"><span>Supported by this check</span><strong className="num">{mass(r.creditableCo2Kg)}</strong><span>Farm reported {mass(r.claimedCo2Kg)}</span><b>Read report →</b></div></Link>)}</div>}
    <p className="helper page-note">These reports describe evidence-supported carbon capture. They do not establish that carbon credits have been issued or that carbon has been permanently stored.</p>
  </main>;
}
