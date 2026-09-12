import Link from 'next/link';
import { LiveDashboard } from '@/components/live-dashboard';
import { getFleet, type FleetPond, type FleetSite } from '@/lib/api';
import { RefreshControls } from '@/components/refresh-controls';
import { FarmPonds } from '@/components/farm-ponds';
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
        <LiveDashboard/><div className="farm-offline">
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

      {/* One action, not four links. Managing land is the only thing a farmer
          comes to this page to DO — everything else on the old chip strip is
          already in the top bar, so it was competing with the ponds for
          attention and winning. */}
      <Link className="farm-manage" href="/farm/land">
        <span className="farm-manage-icon" aria-hidden="true">✎</span>
        <span>
          <strong>Edit ponds and land</strong>
          <span>Add a pond, change its size or depth, or take one out of use</span>
        </span>
        <span className="farm-manage-go" aria-hidden="true">→</span>
      </Link>

      <LiveDashboard/>
      <FarmPonds sites={sites} />

      <section className="farm-foot">
        <p className="helper">
          Reading bands are indicative — hover any reading for what it means. Use the
          pond alerts and your own operating limits to decide on an action. The full
          readings and graphs live in the <Link href="/console">console</Link>.
        </p>
      </section>
    </main>
  );
}
