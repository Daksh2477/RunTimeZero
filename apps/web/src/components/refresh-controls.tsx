'use client';
import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function RefreshControls({ auto = false }: { auto?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') start(() => router.refresh());
    }, 30_000);
    return () => clearInterval(timer);
  }, [auto, router]);
  return <div className="refresh-group">
    {auto && <span className="helper">Updates every 30 seconds</span>}
    <button className="button secondary" onClick={() => start(() => router.refresh())} disabled={pending}>
      <span aria-hidden="true">↻</span> {pending ? 'Refreshing…' : 'Refresh data'}
    </button>
    <span className="sr-only" role="status">{pending ? 'Refreshing data' : ''}</span>
  </div>;
}
