'use client';

/**
 * Main navigation, by audience.
 *
 * The four-way split and the icon-plus-label treatment come from Chetan's
 * frontend branch. Roles are not enforced yet — there is no login — so every
 * destination is visible to everyone. When OTP lands, this is the one place
 * that has to learn to filter.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Chart, Flask, Leaf, Users } from '@/components/icons';

const NAV = [
  { href: '/farm', label: 'Farm', icon: Leaf },
  { href: '/verify', label: 'Market', icon: Chart },
  { href: '/sim', label: 'Lab', icon: Flask },
  { href: '/console', label: 'Fleet', icon: Users },
] as const;

export function Navigation() {
  const path = usePathname();
  return (
    <nav className="main-nav" aria-label="Main navigation">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={path.startsWith(href) ? 'page' : undefined}
        >
          <Icon />
          {label}
        </Link>
      ))}
    </nav>
  );
}
