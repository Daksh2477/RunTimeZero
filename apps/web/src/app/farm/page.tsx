/**
 * The farmer's view. Deliberately contains no chart of any kind.
 *
 * WHY THIS EXISTS SEPARATELY FROM /console
 *
 * /console shows readings, divergence figures and trends. That is the right
 * view for a researcher or an investor, and the wrong one for the person who
 * actually owns the pond: they are standing at the bank of it, on a phone, in
 * sunlight, and they need to know one thing — is anything wrong, and what do I
 * do today. A time-series of optical density does not answer that.
 *
 * So this page answers in that order: a single verdict per pond, then the
 * action, then what it costs to ignore. Numbers appear only where they are the
 * answer to a question a farmer actually asks (how much will I lose).
 *
 * The role split — farmer / researcher / investor — comes from Chetan's
 * frontend branch, which had the right instinct about audience.
 */

import Link from 'next/link';
import { getFleet, type FleetPond, type FleetSite } from '@/lib/api';
import { PondCard } from '@/components/pond-card';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My ponds — AlgaCarbon',
  description: 'What needs doing today.',
};

/** Worst-first: a farmer opening this should meet the problem, not scroll to it. */
const RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

function sortPonds(sites: FleetSite[]): { pond: FleetPond; site: string }[] {
  return sites
    .flatMap((s) => s.ponds.map((pond) => ({ pond, site: s.name })))
    .sort((a, b) => {
      const ra = RANK[a.pond.worstSeverity ?? 'info'] ?? 3;
      const rb = RANK[b.pond.worstSeverity ?? 'info'] ?? 3;
      return ra - rb || a.pond.label.localeCompare(b.pond.label);
    });
}

export default async function FarmPage() {
  // getFleet() returns null when the API is unreachable and [] when it is
  // reachable but has no ponds. Those are different situations and the farmer
  // is told different things, so they must not be collapsed.
  const fetched = await getFleet();
  const failed = fetched === null;
  const sites: FleetSite[] = fetched ?? [];

  const ponds = sortPonds(sites);
  const needAttention = ponds.filter((p) => p.pond.worstSeverity && p.pond.worstSeverity !== 'info');

  if (failed) {
    return (
      <main className="wrap farm">
        <div className="farm-offline">
          <h1>Cannot reach your ponds right now</h1>
          <p>
            This is a connection problem, not a problem with your pond. Your
            sensors keep recording either way.
          </p>
          <Link className="button" href="/farm">Try again</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap farm">
      {/*
        The headline verdict. One sentence, biggest thing on the page, and it
        is the only element on the screen that is ever red.
      */}
      <section className={`farm-verdict ${needAttention.length ? 'is-bad' : 'is-good'}`}>
        <p className="farm-eyebrow">Your ponds today</p>
        {needAttention.length === 0 ? (
          <>
            <h1>Everything looks fine.</h1>
            <p>
              {ponds.length === 1
                ? 'Your pond is growing normally. Nothing needs doing today.'
                : `All ${ponds.length} ponds are growing normally. Nothing needs doing today.`}
            </p>
          </>
        ) : (
          <>
            <h1>
              {needAttention.length === 1
                ? '1 pond needs you today.'
                : `${needAttention.length} ponds need you today.`}
            </h1>
            <p>Start at the top. The rest are fine.</p>
          </>
        )}
      </section>

      <section className="farm-list">
        {ponds.map(({ pond, site }) => (
          <PondCard key={pond.id} pond={pond} siteName={site} />
        ))}
        {ponds.length === 0 && (
          <p className="helper">
            No ponds are set up yet. Once a sensor starts reporting, it appears
            here on its own.
          </p>
        )}
      </section>

      <section className="farm-foot">
        <Link className="button ghost" href="/sim">
          Try a change before you make it
        </Link>
        <p className="helper">
          Want the readings and the graphs? Those live in the{' '}
          <Link href="/console">full console</Link>.
        </p>
      </section>
    </main>
  );
}
