'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function ReportLookup() {
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  return <form className="lookup-form" onSubmit={(e) => {
    e.preventDefault();
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(reference.trim())) { setError('That reference looks incomplete. Copy the full reference from your report.'); return; }
    setError(''); router.push(`/verify/${encodeURIComponent(reference.trim())}`);
  }}><label htmlFor="report-reference">Have a report reference?</label><div className="input-action"><input id="report-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Paste the full report reference" required aria-describedby={error ? 'reference-error' : undefined} aria-invalid={!!error} /><button className="button">Find report →</button></div>{error && <p className="err" id="reference-error" role="alert">{error}</p>}</form>;
}
