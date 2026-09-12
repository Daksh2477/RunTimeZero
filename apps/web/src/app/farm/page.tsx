import Link from 'next/link';
import { getFleet, type FleetPond, type FleetSite } from '@/lib/api';
import { RefreshControls } from '@/components/refresh-controls';
import { PondCard } from '@/components/pond-card';
import { pondState, TONE_RANK } from '@/lib/pond-state';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My ponds — AlgaCarbon',
  description: 'What needs doing today.',
};

function sortPonds(sites: FleetSite[]): { pond: FleetPond; site: string }[] {
  return sites
    .flatMap((s) => s.ponds.map((pond) => ({ pond, site: s.name })))
    .sort((a, b) => {
      // The same function the cards use, so the order and the labels agree.
      const ra = TONE_RANK[pondState(a.pond).tone];
      const rb = TONE_RANK[pondState(b.pond).tone];
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
  const needAttention = ponds.filter((p) => pondState(p.pond).tone !== 'ok');
  if (failed) {
    return (
      <main className="wrap farm">
        <div className="farm-offline">
          <h1>Cannot reach your ponds right now</h1>
          <p>
            We could not load the pond records. This does not tell us whether the sensors or ponds are working normally.
          </p>
          <RefreshControls />
        </div>
      </main>
    );
  }

  return (
    <main className="wrap farm">
      <div className="page-heading"><div><p className="eyebrow">POND MONITORING</p><h1>Your ponds today</h1><p>Start with the alerts, then check the latest readings.</p></div><RefreshControls auto /></div>
      <section className={`farm-verdict ${ponds.some(({ pond }) => pondState(pond).tone === 'bad') ? 'is-bad' : needAttention.length ? 'is-watch' : ''}`}>
        <h2>{!ponds.length ? 'No ponds have been added yet' : needAttention.length ? `${needAttention.length} ${needAttention.length === 1 ? 'pond needs' : 'ponds need'} a closer look` : 'No urgent alerts in the available records'}</h2>
        <p>{!ponds.length ? 'Explore a sample pond while your site is being configured.' : 'Readings can be old or incomplete. Check the time shown on each pond before acting.'}</p>
      </section>

      <section className="farm-list">
        {ponds.map(({ pond, site }) => (
          <PondCard key={pond.id} pond={pond} siteName={site} />
        ))}
        {ponds.length === 0 && (
          <p className="helper">
            Your site and its sensors need to be configured before readings can appear here.
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
