import { getFleet } from '@/lib/api';
import { PondOverview } from '@/components/pond-overview';
import { RefreshControls } from '@/components/refresh-controls';
import { EmptyState } from '@/components/ui';
import Link from 'next/link';
export const dynamic = 'force-dynamic';

export default async function ConsolePage() {
  const fleet = await getFleet();
  return <main className="wrap">
    <div className="page-heading"><div><p className="eyebrow">MY PONDS</p><h1>Your ponds, at a glance.</h1><p>See what needs attention and how much carbon the evidence supports.</p></div><RefreshControls auto /></div>
    {!fleet ? <EmptyState title="We couldn’t load your ponds"><p>The farm connection is unavailable right now. Refresh to try again, or explore a sample pond.</p><div className="actions"><RefreshControls /><Link className="button secondary" href="/sim">Try a sample pond</Link></div></EmptyState> : <PondOverview fleet={fleet} />}
    <details className="help-card"><summary>New here? How a carbon check works</summary><div className="steps">
      <div><span>1</span><h3>The farm reports an amount</h3><p>Sensors and farm records describe how the algae grew.</p></div>
      <div><span>2</span><h3>We compare the evidence</h3><p>Images, harvest records and a sunlight model help check that report.</p></div>
      <div><span>3</span><h3>You see what is supported</h3><p>The result shows a cautious amount backed by the recorded evidence. It does not issue credits.</p></div>
    </div></details>
  </main>;
}
