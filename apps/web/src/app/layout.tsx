import type { Metadata } from 'next';
import Link from 'next/link';
import { DM_Sans, IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import { Navigation } from '@/components/navigation';
import './globals.css';

/*
 * The three faces from Chetan's design. Loaded through next/font rather than
 * a Google Fonts <link>: it self-hosts them at build time, so there is no
 * third-party round trip on a rural connection and no layout shift when they
 * land.
 */
const display = Space_Grotesk({
  subsets: ['latin'], weight: ['500', '600', '700'],
  variable: '--font-space-grotesk', display: 'swap',
});
const sans = DM_Sans({
  subsets: ['latin'], weight: ['400', '500', '600'],
  variable: '--font-dm-sans', display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400', '500'],
  variable: '--font-plex-mono', display: 'swap',
});

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
  return <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}><body>
    <a className="skip-link" href="#main-content">Skip to page content</a>
    <header className="masthead"><div className="masthead-inner">
      <Link href="/" className="wordmark" aria-label="AlgaCarbon home">
        <span className="brand-icon" aria-hidden="true">a</span>Alga<span>Carbon</span>
      </Link>
      <Navigation />
      <span className="prototype-label">Hackathon prototype</span>
    </div></header>
    <div id="main-content" tabIndex={-1}>{children}</div>
    <footer className="footer"><span>AlgaCarbon · RunTimeZero</span><span>Prototype results may use simulated data. Carbon credits require a separate review.</span></footer>
  </body></html>;
}
