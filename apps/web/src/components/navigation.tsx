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
import { Chart, Coins, Flask, Leaf, Shield } from '@/components/icons';
import { ROLE_META, canAccess, useRole } from '@/lib/session';

/*
 * Four destinations, one distinct icon each. Land management moved inside
 * "My ponds" (it is the same job), the sensor page is reached from the
 * homepage, and the separate all-ponds and admin consoles are gone — a top bar
 * with eight entries is a top bar nobody reads.
 *
 * An earlier version reused four icons across eight
 * identical leaves, two charts and two flasks in a row.
 */
const NAV = [
  { href: '/farm', label: 'My ponds', icon: Leaf },
  { href: '/console/market', label: 'Marketplace', icon: Coins },
  { href: '/console/researcher', label: 'Research data', icon: Flask },
  { href: '/verify', label: 'Carbon reports', icon: Shield },
  { href: '/sim', label: 'Simulator', icon: Chart },
] as const;

export function Navigation() {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { role } = useRole();

  /*
   * No early return while the account is still being read.
   *
   * `ready` used to be a localStorage read that resolved in the same tick;
   * it is now a round trip to /auth/me. Blanking the whole bar until that
   * lands took the sign-in link off the top of every page for as long as the
   * request took, and forever if it failed — which is why the site looked
   * like it had lost its way in. Show the signed-out set meanwhile; it is
   * the correct answer for anyone who is in fact signed out.
   */
  const visible = role ? NAV.filter((n) => canAccess(role, n.href)) : NAV.filter(n => ['/console/market','/verify','/sim'].includes(n.href));
  const phone = role === 'admin' ? [{href:'/console/admin',label:'Admin',icon:Shield}, ...visible.filter(n=>n.href!=='/console/researcher')] : role === 'buyer' ? [{href:'/console/investor',label:'Invest',icon:Chart}, ...visible] : visible;
  const active = visible.filter(n => path === n.href || path.startsWith(n.href + '/')).sort((a,b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className={`nav-cluster${role ? " has-account" : ""}`}>
      {<button type="button" className="mobile-nav-toggle" aria-expanded={menuOpen} aria-controls="app-navigation" onClick={() => setMenuOpen(open => !open)}>{visible.find(n=>n.href===active)?.label ?? 'Menu'} <span aria-hidden="true">{menuOpen ? '−' : '☰'}</span></button>}
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
      {role && path !== '/sim' && <nav className="phone-navigation" aria-label="Workspace navigation">{phone.slice(0,5).map(({href,label,icon:Icon})=><Link key={href} href={href} aria-current={path===href?'page':undefined}><Icon /><span>{label==='Marketplace'?'Market':label==='Carbon reports'?'Reports':label==='Research data'?'Research':label}</span></Link>)}</nav>}
      {role ? (
        <Link href="/enter" className="role-pill">
          <span className="role-name">{ROLE_META[role].label} · </span>My account
        </Link>
      ) : (
        <Link href="/enter" className="role-pill">Sign in</Link>
      )}
    </div>
  );
}
