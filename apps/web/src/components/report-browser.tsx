'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ReportRow } from '@/lib/api';
import { dateLabel, mass } from '@/lib/display';
import { EmptyState, StatusBadge } from '@/components/ui';

export function ReportBrowser({ reports }: { reports: ReportRow[] }) {
  const [query, setQuery] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const shown = reports.filter(r => `${r.pondLabel} ${r.siteName} ${r.checkId}`.toLowerCase().includes(query.trim().toLowerCase()) && (!reviewOnly || r.verdict !== 'ok'));
  return <>
    <div className="toolbar"><label className="search-label"><span className="sr-only">Search reports by pond, farm or reference</span><input type="search" placeholder="Search a pond, farm or reference…" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="filter-group" role="group" aria-label="Filter carbon reports"><button className="filter-button" aria-pressed={!reviewOnly} onClick={() => setReviewOnly(false)}>All reports</button><button className="filter-button" aria-pressed={reviewOnly} onClick={() => setReviewOnly(true)}>Need review or evidence</button></div></div>
    <p className="helper" role="status">{shown.length} {shown.length === 1 ? 'report' : 'reports'} shown</p>
    {!shown.length ? <EmptyState title="No reports match this view"><p>Try another search or show all reports.</p><button className="button secondary" onClick={() => { setQuery(''); setReviewOnly(false); }}>Clear filters</button></EmptyState> : <div className="report-list">{shown.map(r => <Link className="report-card" href={`/verify/${r.checkId}`} key={r.checkId}><div><StatusBadge verdict={r.verdict} /><h3>{r.pondLabel}</h3><p>{r.siteName}</p><small>Checked {dateLabel(r.computedAt)}</small></div><div className="report-amount"><span>Supported by this check</span><strong className="num">{mass(r.creditableCo2Kg)}</strong><span>Farm reported {mass(r.claimedCo2Kg)}</span><b>Read report →</b></div></Link>)}</div>}
  </>;
}
