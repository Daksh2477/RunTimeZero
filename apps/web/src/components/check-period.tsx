'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CheckPeriod({ pondId }: { pondId: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (to <= from) { setError('Choose an end date after the start date.'); return; }
    if (Date.parse(to) - Date.parse(from) > 120 * 86400000) { setError('Choose a period of 120 days or less.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/ponds/${encodeURIComponent(pondId)}/reconcile`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ windowStart: `${from}T00:00:00Z`, windowEnd: `${to}T00:00:00Z` }), signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        if (response.status === 409) throw new Error('These dates overlap an existing report. Open that report, or choose a different period.');
        throw new Error('We couldn’t complete this check. Please try again shortly.');
      }
      const result = await response.json();
      router.push(`/verify/${encodeURIComponent(result.checkId)}`);
    } catch (e) { setError(e instanceof Error && e.name === 'Error' ? e.message : 'The connection took too long. Please try again.'); }
    finally { setBusy(false); }
  }
  return <details className="help-card"><summary>Check a different period</summary><p>Choose dates that have farm readings and evidence. A saved report will open when the check finishes.</p>
    <form onSubmit={submit} className="check-form"><label>Start date<input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} /></label><label>End date<input type="date" required min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} /></label>
      <p className="helper">Dates use UTC. The check includes the start date and stops before the end date. Maximum: 120 days.</p>
      <button className="button" disabled={busy}>{busy ? 'Checking the records…' : 'Create carbon report →'}</button>{error && <p className="err" role="alert">{error}</p>}
    </form></details>;
}
