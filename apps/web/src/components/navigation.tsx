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
import { Chart, Flask, Leaf, Users } from '@/components/icons';
import { ROLE_META, canAccess, clearRole, useRole } from '@/lib/session';

const NAV = [
  { href: '/farm', label: 'My ponds', icon: Leaf },
  { href: '/console/investor', label: 'Market', icon: Chart },
  { href: '/console/researcher', label: 'Data', icon: Flask },
  { href: '/verify', label: 'Verify', icon: Chart },
  { href: '/sim', label: 'Simulator', icon: Flask },
  { href: '/console', label: 'All ponds', icon: Users },
  { href: '/console/admin', label: 'Admin', icon: Users },
] as const;

export function Navigation() {
  const path = usePathname();
  const { role, ready } = useRole();

  // Before the role is read, show nothing rather than flashing the full set.
  if (!ready) return <nav className="main-nav" aria-label="Main navigation" />;

  const visible = role ? NAV.filter((n) => canAccess(role, n.href)) : [];

  return (
    <nav className="main-nav" aria-label="Main navigation">
      {visible.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={path.startsWith(href) ? 'page' : undefined}
        >
          <Icon />
          {label}
        </Link>
      ))}

      {role ? (
        <Link href="/enter" className="role-pill" onClick={() => clearRole()}>
          {ROLE_META[role].label} · switch
        </Link>
      ) : (
        <Link href="/enter" className="role-pill">Sign in</Link>
      )}
    </nav>
  );
}
