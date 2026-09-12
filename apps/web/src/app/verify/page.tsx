import Link from 'next/link';
import { getReports } from '@/lib/api';
import { EmptyState } from '@/components/ui';
import { ReportBrowser } from '@/components/report-browser';
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
      : <ReportBrowser reports={rows} />}
    <p className="helper page-note">These reports describe evidence-supported carbon capture. They do not establish that carbon credits have been issued or that carbon has been permanently stored.</p>
  </main>;
}
