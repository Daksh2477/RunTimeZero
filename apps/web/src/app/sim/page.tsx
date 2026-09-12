/**
 * Pond simulator.
 *
 * Two ways in, and the second is the one that matters:
 *
 *   /sim              a sample pond, for anyone curious
 *   /sim?pond=<id>    YOUR pond, already filled in
 *
 * The second exists because asking a farmer to re-enter the size and depth of
 * a pond we already hold is asking them to do our data entry. From the pond
 * page it is one tap and the model is already describing their water.
 */

import Link from 'next/link';
import { getPond } from '@/lib/api';
import { LiveSimulator } from '@/components/live-simulator';

export const dynamic = 'force-dynamic';

export default async function SimPage({
  searchParams,
}: {
  searchParams: Promise<{ pond?: string }>;
}) {
  const { pond: pondId } = await searchParams;
  const data = pondId ? await getPond(pondId) : null;
  const p = data?.pond;

  // Seed the model from the real pond when we have one. Latitude is not on
  // the pond payload, so the site's region default stands in — it moves the
  // answer by very little compared with size and depth.
  const initial = p
    ? {
        areaM2: Math.round(p.areaM2),
        depthM: p.depthM,
        seed: Math.abs(
          [...p.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7),
        ) % 100000,
      }
    : undefined;

  return (
    <main className="wrap">
      {p && (
        <Link className="back" href={`/console/pond/${p.id}`}>
          ← Back to {p.label}
        </Link>
      )}

      <div className="page-heading">
        <div>
          <p className="eyebrow">PLAN AHEAD</p>
          <h1>{p ? `What could ${p.label} do?` : 'Try a pond'}</h1>
          <p>
            {p
              ? 'Starting from this pond as it is today. Move anything and watch what changes — nothing here touches your real records.'
              : 'Move the controls and watch the pond respond. Nothing is saved.'}
          </p>
        </div>
      </div>

      <LiveSimulator
        initial={initial}
        pondLabel={p?.label}
        siteName={p?.siteName}
      />

      <p className="helper" style={{ marginTop: 20, maxWidth: '60ch' }}>
        This uses the same physics that checks your carbon claims — sunlight for
        your latitude, algae growth, and the way a dense pond shades itself. It
        is an estimate, not a promise.
      </p>
    </main>
  );
}
