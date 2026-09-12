'use client';

/**
 * The simulator page's shell, as a client component.
 *
 * WHY THE QUERY STRING IS READ HERE AND NOT ON THE SERVER
 *
 * `/sim` used to be an async server component that did `await searchParams`
 * to pick up `?pond=<id>`. On Next 15.5 that silently stops the client
 * subtree below it from hydrating: the markup renders, React never attaches,
 * no error is logged anywhere, and the simulator sits on "Updating
 * estimate…" forever. It took a bisect to find, because every individual
 * piece — the WASM module, runTwin, LiveSimulator on a plain page — worked.
 *
 * Reading the query string with useSearchParams keeps the whole thing on the
 * client, where it hydrates normally. It also means changing pond does not
 * need a server round trip.
 *
 * If you ever move this back to the server, check that the simulator still
 * produces numbers before you commit it.
 */

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LiveSimulator } from '@/components/live-simulator';
import type { RunConfig } from '@/lib/twin';

interface Pond {
  id: string; label: string; siteName: string;
  areaM2: number; depthM: number;
}

const BASE = '/api/backend';

/** Stable per pond, so the same pond always simulates identically. */
const seedFrom = (id: string) =>
  Math.abs([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 100_000;

function Workspace() {
  const pondId = useSearchParams().get('pond');
  const [pond, setPond] = useState<Pond | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!pondId) return;
    let live = true;
    fetch(`${BASE}/fleet/pond/${pondId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) { if (d?.pond) setPond(d.pond); else setMissing(true); } })
      .catch(() => { if (live) setMissing(true); });
    return () => { live = false; };
  }, [pondId]);

  const initial: Partial<RunConfig> | undefined = pond
    ? {
        areaM2: Math.round(pond.areaM2),
        depthM: pond.depthM,
        seed: seedFrom(pond.id),
      }
    : undefined;

  return (
    <main className="wrap simulation-page">
      {pond && (
        <Link className="back" href={`/console/pond/${pond.id}`}>
          ← Back to {pond.label}
        </Link>
      )}

      <div className="page-heading">
        <div>
          <p className="eyebrow">PLAN AHEAD</p>
          <h1>{pond ? `What could ${pond.label} do?` : 'Explore a virtual pond'}</h1>
          <p>
            {pond
              ? 'Using this pond’s size and depth with sample starting conditions. Adjust the controls to explore the model; your real records stay unchanged.'
              : 'Choose a scenario, explore the pond, and read the response. Adjust the conditions alongside it.'}
          </p>
        </div>
      </div>

      {missing && (
        <div className="inline-notice" role="status">
          We couldn’t load that pond. The simulator below uses a sample pond
          instead. <Link href="/farm">Return to your ponds</Link>.
        </div>
      )}

      {/* Keyed on the pond so switching ponds restarts the model cleanly
          rather than mutating a run that is already in flight. */}
      <LiveSimulator
        key={pond?.id ?? 'sample'}
        initial={initial}
        pondLabel={pond?.label}
        siteName={pond?.siteName}
      />

      <p className="helper" style={{ marginTop: 20, maxWidth: '60ch' }}>
        This uses the same physics that checks your carbon claims — sunlight
        for your latitude, algae growth, and the way a dense pond shades
        itself. It is an estimate, not a promise.
      </p>
    </main>
  );
}

/** useSearchParams needs a Suspense boundary above it. */
export function SimWorkspace() {
  return (
    <Suspense fallback={<main className="wrap simulation-page" />}>
      <Workspace />
    </Suspense>
  );
}
