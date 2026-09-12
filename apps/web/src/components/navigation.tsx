'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navigation() {
  const path = usePathname();
  return <nav className="main-nav" aria-label="Main navigation">
    {[['/console', 'My ponds'], ['/verify', 'Carbon reports'], ['/sim', 'Try a pond']].map(([href, label]) =>
      <Link key={href} href={href!} aria-current={path.startsWith(href!) ? 'page' : undefined}>{label}</Link>)}
  </nav>;
}
