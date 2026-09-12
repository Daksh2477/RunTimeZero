'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { FleetPond, FleetSite } from '@/lib/api';
import { mass, readingTime, statusInfo } from '@/lib/display';
import { EmptyState, StatusBadge } from './ui';

const needsAttention = (p: FleetPond) => p.verdict === 'flagged' || p.verdict === 'watch' || p.advisoryCount > 0;
const pendingCheck = (p: FleetPond) => !p.verdict || p.verdict === 'insufficient_evidence';

export function PondOverview({ fleet }: { fleet: FleetSite[] }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const ponds = fleet.flatMap((s) => s.ponds);
  const attention = ponds.filter(needsAttention).length;
  const waiting = ponds.filter(pendingCheck).length;
  const visible = fleet.map((s) => ({ ...s, ponds: s.ponds.filter((p) => {
    const matches = `${s.name} ${p.label}`.toLowerCase().includes(search.trim().toLowerCase());
    return matches && (filter === 'attention' ? needsAttention(p) : filter === 'waiting' ? pendingCheck(p) : true);
  }).sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a))) })).filter((s) => s.ponds.length);

  return <>
    <div className="summary-grid">
      <div className="summary-card"><span>Ponds being tracked</span><strong className="num">{ponds.length}</strong><small>Across {fleet.length} farm locations</small></div>
      <div className={`summary-card ${attention ? 'attention' : ''}`}><span>Need your attention</span><strong className="num">{attention}</strong><small>Have a pond alert or a check to review</small></div>
      <div className="summary-card"><span>Waiting for a check or evidence</span><strong className="num">{waiting}</strong><small>These are not confirmed results yet</small></div>
    </div>
    <div className="section-heading"><div><h2>Your ponds</h2><p>Open a pond to see its readings and suggested next steps.</p></div></div>
    <div className="toolbar"><div className="filter-group" role="group" aria-label="Filter ponds">
      {[['all', 'All ponds'], ['attention', 'Need attention'], ['waiting', 'Waiting for a check']].map(([value, label]) =>
        <button key={value} className="filter-button" aria-pressed={filter === value} onClick={() => setFilter(value!)}>{label}</button>)}
    </div><label className="search-label"><span className="sr-only">Search ponds or farms</span><input type="search" placeholder="Search a pond or farm…" value={search} onChange={(e) => setSearch(e.target.value)} /></label></div>
    <p className="sr-only" role="status">{visible.reduce((n, s) => n + s.ponds.length, 0)} ponds shown</p>
    {!ponds.length ? <EmptyState title="Your ponds will appear here"><p>No ponds have been added yet. You can explore a sample pond while the farm is being set up.</p><Link className="button" href="/sim">Try a sample pond →</Link></EmptyState>
      : !visible.length ? <EmptyState title="No ponds match this view"><p>Try another name or show all your ponds.</p><button className="button secondary" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</button></EmptyState>
      : visible.map((site) => <section className="site" key={site.id} aria-label={site.name}>
        <div className="site-head"><div><h3 className="site-name">{site.name}</h3><p className="site-meta">{site.ponds.length} {site.ponds.length === 1 ? 'pond' : 'ponds'} shown</p></div><Link className="text-link" href={`/console/site/${site.id}`}>View farm costs →</Link></div>
        <div className="pond-grid">{site.ponds.map((p) => <Link className="pond-card" key={p.id} href={`/console/pond/${p.id}`}>
          <div className="pond-card-head"><h4>{p.label}</h4><StatusBadge verdict={p.verdict} /></div>
          <p className="pond-description">{statusInfo(p.verdict).detail}</p>
          <div className="pond-amount"><span>Carbon supported by the latest check</span><strong className="num">{p.verdict ? mass(p.creditableCo2Kg) : 'Not checked yet'}</strong></div>
          <p className={`pond-alert ${p.advisoryCount ? 'has-alert' : ''}`}>{p.advisoryCount ? `${p.advisoryCount} pond ${p.advisoryCount === 1 ? 'alert' : 'alerts'} to review` : p.lastReadingAt ? 'No alerts from the available readings' : 'Waiting for sensor readings'}</p>
          <div className="pond-card-foot"><span>Last reading: {readingTime(p.lastReadingAt)}</span><strong>Open pond →</strong></div>
        </Link>)}</div>
      </section>)}
  </>;
}
