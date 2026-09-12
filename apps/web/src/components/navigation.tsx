'use client';

/**
 * Navigation, filtered by the chosen role.
 *
 * This is the fix for "why can some random access everything" — a farmer no
 * longer sees the investor trade panel or the researcher lab, because those
 * screens mean nothing to them and landing in one is disorienting.
 *
 * The filtering is a usability boundary, not a security one. `lib/session.ts`
 * says why, and the role badge links back to the picker so switching is one
 * tap rather than a mystery.
 */

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Chart, Coins, Cog, Flask, Leaf, Map, Shield, Users } from '@/components/icons';
import { ROLE_META, canAccess, clearRole, useRole } from '@/lib/session';

/*
 * One distinct icon each. An earlier version reused four icons across eight
 * destinations, which on a phone — where the labels are hidden — left two
 * identical leaves, two charts and two flasks in a row.
 */
const NAV = [
  { href: '/farm', label: 'My ponds', icon: Leaf },
  { href: '/farm/land', label: 'My land', icon: Map },
  { href: '/console/market', label: 'Marketplace', icon: Coins },
  { href: '/console/researcher', label: 'Research data', icon: Flask },
  { href: '/verify', label: 'Carbon reports', icon: Shield },
  { href: '/sim', label: 'Simulator', icon: Chart },
  { href: '/console', label: 'All ponds', icon: Users },
  { href: '/console/admin', label: 'Admin', icon: Cog },
] as const;

export function Navigation() {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { role, ready } = useRole();

  // Before the role is read, show nothing rather than flashing the full set.
  if (!ready) return <nav className="main-nav" aria-label="Main navigation" />;

  const visible = role ? NAV.filter((n) => canAccess(role, n.href)) : [];
  const active = visible.filter(n => path === n.href || path.startsWith(n.href + '/')).sort((a,b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="nav-cluster">
      {role && <button type="button" className="mobile-nav-toggle" aria-expanded={menuOpen} aria-controls="app-navigation" onClick={() => setMenuOpen(open => !open)}>{visible.find(n=>n.href===active)?.label ?? 'Menu'} <span aria-hidden="true">{menuOpen ? '−' : '☰'}</span></button>}
      <nav id="app-navigation" className="main-nav" data-open={menuOpen} aria-label="Main navigation">
      {visible.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setMenuOpen(false)}
          aria-current={active === href ? 'page' : undefined}
        >
          <Icon />
          {/* Wrapped so CSS can drop the label on a phone and leave the
              icon, which is what lets five destinations share one row. */}
          <span className="nav-label">{label}</span>
        </Link>
      ))}

      </nav>
      {role ? (
        <Link href="/enter" className="role-pill" onClick={() => clearRole()}>
          <span className="role-name">{ROLE_META[role].label} · </span>Switch view
        </Link>
      ) : (
        <Link href="/enter" className="role-pill">Choose your view</Link>
      )}
    </div>
  );
}
