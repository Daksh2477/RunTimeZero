/**
 * 404.
 *
 * An empty screen is an invitation to act, not a place to apologise. Someone
 * lands here from a mistyped address or a stale link, so the page says plainly
 * what happened and offers the three things they were probably looking for.
 */

import Link from 'next/link';

export const metadata = { title: 'Page not found — AlgaCarbon' };

export default function NotFound() {
  return (
    <main className="wrap notfound">
      <p className="eyebrow">PAGE NOT FOUND</p>
      <h1>That page isn&rsquo;t here.</h1>
      <p>
        The address may be mistyped, or the page may have moved. Nothing is
        wrong with your data.
      </p>

      <div className="notfound-links">
        <Link className="button" href="/">Go to the start</Link>
        <Link className="button secondary" href="/console">My ponds</Link>
        <Link className="button secondary" href="/verify">Check a report</Link>
      </div>

      <p className="helper" style={{ marginTop: 22 }}>
        Looking for a specific carbon report? Every report has a reference code
        — paste it on the <Link href="/verify">check a report</Link> page.
      </p>
    </main>
  );
}
