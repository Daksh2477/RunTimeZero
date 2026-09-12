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
  { href: '/console/market', label: 'Market', icon: Coins },
  { href: '/console/researcher', label: 'Data', icon: Flask },
  { href: '/verify', label: 'Verify', icon: Shield },
  { href: '/sim', label: 'Simulator', icon: Chart },
  { href: '/console', label: 'All ponds', icon: Users },
  { href: '/console/admin', label: 'Admin', icon: Cog },
] as const;

export function Navigation() {
  const path = usePathname();
  const { role, ready } = useRole();

  // Before the role is read, show nothing rather than flashing the full set.
  if (!ready) return <nav className="main-nav" aria-label="Main navigation" />;

  const visible = role ? NAV.filter((n) => canAccess(role, n.href)) : [];

  return (
    <div className="nav-cluster">
      <nav className="main-nav" aria-label="Main navigation">
      {visible.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={path.startsWith(href) ? 'page' : undefined}
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
          {ROLE_META[role].label}
        </Link>
      ) : (
        <Link href="/enter" className="role-pill">Sign in</Link>
      )}
    </div>
  );
}
