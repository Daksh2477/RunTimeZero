import type { Metadata } from 'next';
import Link from 'next/link';
import { Navigation } from '@/components/navigation';
import './globals.css';

/**
 * Without this every media query in globals.css is dead: phones assume a
 * ~980px canvas and zoom out, which for an app aimed at farmers on phones
 * makes the whole thing unusable. maximumScale is deliberately left alone —
 * blocking pinch-zoom fails accessibility.
 */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export const metadata: Metadata = {
  title: { default: 'AlgaCarbon · Your ponds, clearly', template: '%s · AlgaCarbon' },
  description: 'Understand your algae ponds, review carbon evidence, and explore a sample pond.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>
    <a className="skip-link" href="#main-content">Skip to page content</a>
    <header className="masthead"><div className="masthead-inner">
      <Link href="/console" className="wordmark" aria-label="AlgaCarbon home">
        <span className="brand-icon" aria-hidden="true">a</span>Alga<span>Carbon</span>
      </Link>
      <Navigation />
      <span className="prototype-label">Hackathon prototype</span>
    </div></header>
    <div className="notice-strip">Understand your ponds. Check the evidence. Make informed decisions.</div>
    <div id="main-content" tabIndex={-1}>{children}</div>
    <footer className="footer"><span>AlgaCarbon · RunTimeZero</span><span>Prototype results may use simulated data. Carbon credits require a separate review.</span></footer>
  </body></html>;
}
