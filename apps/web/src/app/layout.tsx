import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AlgaCarbon',
  description: 'Verification for algae-based carbon sequestration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="masthead">
          <div className="masthead-inner">
            <a href="/console" className="wordmark">
              Alga<span>Carbon</span>
            </a>
            <div className="masthead-note">
              Credit the lower of what was claimed and what the evidence supports
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
