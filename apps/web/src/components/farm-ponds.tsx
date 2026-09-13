'use client';

/**
 * The pond list on /farm.
 *
 * This is the old "all ponds" console layout — a count across the top, a
 * filter row, a search box, and ponds grouped under their site — with the live
 * reading cards in the grid instead of the verdict-only tiles. The two pages
 * were showing the same ponds two different ways, and this was the better way:
 * a farmer with seven ponds wants to filter to the two that need something,
 * and a farmer with one does not notice the filters at all.
 *
 * Client-side because filtering and searching a list you already have should
 * not cost a server round trip.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { FleetPond, FleetSite } from '@/lib/api';
import { PondCard } from '@/components/pond-card';
import { pondState, TONE_RANK } from '@/lib/pond-state';
import { useLiveStream } from '@/lib/use-live-stream';

type Filter = 'all' | 'attention' | 'waiting';

const needsAttention = (p: FleetPond) => pondState(p).tone !== 'ok';
/** No verdict yet, or one the engine could not stand behind. */
const pendingCheck = (p: FleetPond) => !p.verdict || p.verdict === 'insufficient_evidence';

export function FarmPonds({ sites: initialSites }: { sites: FleetSite[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  // Live readings overlay the server snapshot in place, so the cards update
  // without a page refresh (which flickered the whole list every 30 s).
  const live = useLiveStream();
  const sites = useMemo(() => {
    const byPond = new Map(live.readings.map((r) => [r.pondId, r]));
    return initialSites.map((site) => ({
      ...site,
      ponds: site.ponds.map((pond) => {
        const r = byPond.get(pond.id);
        if (!r || (!r.receivedAt && pond.lastReadingAt && Date.parse(pond.lastReadingAt) >= Date.parse(r.at))) return pond;
        return {
          ...pond,
          lastReadingAt: r.at,
          latest: {
            ...(pond.latest ?? {}),
            temperatureC: r.readings.tempC,
            ph: r.readings.ph,
            dissolvedOxygenMgL: r.readings.doMgL,
            opticalDensity: r.readings.od,
            mixing: r.readings.paddlewheelOn ?? pond.latest?.mixing ?? null,
          },
        } as FleetPond;
      }),
    }));
  }, [initialSites, live.readings]);
  const [search, setSearch] = useState('');

  const replay=live.readings.filter(r=>r.source==='sim'&&r.receivedAt).sort((a,b)=>(b.receivedAt??0)-(a.receivedAt??0))[0];
  const all = useMemo(() => sites.flatMap((s) => s.ponds), [sites]);
  const attention = all.filter(needsAttention).length;
  const waiting = all.filter(pendingCheck).length;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sites
      .map((site) => ({
        ...site,
        ponds: site.ponds
          .filter((pond) => {
            const matches = `${site.name} ${pond.label}`.toLowerCase().includes(needle);
            if (!matches) return false;
            if (filter === 'attention') return needsAttention(pond);
            if (filter === 'waiting') return pendingCheck(pond);
            return true;
          })
          // Worst first, the same ranking the cards use, so the order and the
          // labels cannot disagree.
          .sort((a, b) => TONE_RANK[pondState(a).tone] - TONE_RANK[pondState(b).tone]
            || a.label.localeCompare(b.label)),
      }))
      .filter((site) => site.ponds.length > 0);
  }, [sites, filter, search]);

  const shown = visible.reduce((n, s) => n + s.ponds.length, 0);

  if (all.length === 0) {
    return (
      <p className="helper">
        Your site and its sensors need to be configured before readings can appear
        here. <Link href="/sim">Explore a sample pond</Link> meanwhile.
      </p>
    );
  }

  return (
    <>
      {replay&&<p className="inline-notice" role="status">Simulation replay · {new Date(replay.at).toLocaleString('en-IN')} · received {Math.max(0,Math.floor((live.now-replay.receivedAt!)/1000))} s ago · {replay.verified?'Signed device reading':'Unverified source'}. Stored carbon reports use their own evidence windows.</p>}
      <div className="farm-counts">
        <div>
          <span>Ponds tracked</span>
          <strong>{all.length}</strong>
          <small>
            across {sites.length} {sites.length === 1 ? 'location' : 'locations'}
          </small>
        </div>
        <div className={attention ? 'is-attention' : ''}>
          <span>Need attention</span>
          <strong>{attention}</strong>
          <small>an alert, or a reading too old to trust</small>
        </div>
        <div>
          <span>Waiting on a check</span>
          <strong>{waiting}</strong>
          <small>not a result yet, in either direction</small>
        </div>
      </div>

      <div className="farm-toolbar">
        <div className="filter-group" role="group" aria-label="Filter ponds">
          {([['all', 'All ponds'], ['attention', 'Need attention'], ['waiting', 'Waiting on a check']] as const)
            .map(([value, label]) => (
              <button
                key={value} type="button" className="filter-button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
        </div>
        <label className="search-label">
          <span className="sr-only">Search ponds or sites</span>
          <input
            type="search" placeholder="Search a pond or site…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <p className="sr-only" role="status">{shown} ponds shown</p>

      {visible.length === 0 ? (
        <div className="farm-empty">
          <p>No ponds match this view.</p>
          <button
            type="button" className="button secondary"
            onClick={() => { setSearch(''); setFilter('all'); }}
          >
            Show all ponds
          </button>
        </div>
      ) : (
        visible.map((site) => (
          <section className="farm-site" key={site.id} aria-label={site.name}>
            {/* The site heading only earns its space when there is more than
                one — a single-site farmer already knows where they are. */}
            {sites.length > 1 && (
              <div className="farm-site-head">
                <h2>{site.name}</h2>
                <span>{site.ponds.length} shown</span>
              </div>
            )}
            <div className="farm-list">
              {site.ponds.map((pond) => (
                <PondCard key={pond.id} pond={pond} siteName={site.name} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
