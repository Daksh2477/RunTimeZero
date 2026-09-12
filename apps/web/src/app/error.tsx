'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="wrap"><div className="empty"><h1>Something didn’t load.</h1><p>Your saved records are unchanged. Try opening this page again.</p><div className="actions"><button className="button" onClick={reset}>Try again</button><Link className="button secondary" href="/console">Back to my ponds</Link></div></div></main>;
}
