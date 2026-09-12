'use client';

/**
 * Which console you are looking at, and what that role may reach.
 *
 * WHAT THIS IS AND IS NOT
 *
 * This is NOT authentication. It holds a chosen role in localStorage so the
 * console shows one audience's screens instead of all of them at once, which
 * was the real complaint: a farmer landing in an investor's trade panel has
 * no idea what they are looking at.
 *
 * It stops confusion, not an attacker. Anything that actually must be
 * protected has to be enforced by the API, because a localStorage value is
 * trivially edited. The honest framing is on the sign-in screen itself, and
 * `ROLE_META.authMode` records what real auth would look like per role —
 * OTP for farmers who will not manage a password, KYC for investors who are
 * moving money, invitation-only for researchers buying farm data.
 *
 * Ported from Chetan's frontend branch (src/lib/session.ts).
 */

import { useEffect, useState } from 'react';

export type Role = 'farmer' | 'investor' | 'researcher' | 'admin';

const KEY = 'rtz.role';
const EVENT = 'rtz-session-change';

export const ROLE_META: Record<Role, {
  label: string;
  tagline: string;
  authMode: string;
  home: string;
  selfServe: boolean;
}> = {
  farmer: {
    label: 'Farmer',
    tagline: 'Field and operations',
    authMode: 'Passwordless — SMS OTP or a link by email',
    home: '/farm',
    selfServe: true,
  },
  investor: {
    label: 'Investor',
    tagline: 'Credits, farms and the marketplace',
    authMode: 'Corporate email plus KYC before any trade settles',
    home: '/console/investor',
    selfServe: true,
  },
  researcher: {
    label: 'Researcher',
    tagline: 'Datasets and the simulation lab',
    authMode: 'Invitation only — a named institution and a stated purpose',
    home: '/console/researcher',
    selfServe: false,
  },
  admin: {
    label: 'Operator',
    tagline: 'Everything, plus consent and issuance',
    authMode: 'Internal accounts only',
    home: '/console/admin',
    selfServe: false,
  },
};

/**
 * What each role may open.
 *
 * A farmer reaches the marketplace because they are the one selling; they do
 * not reach the researcher lab, because the data being sold is theirs and
 * browsing it is not their job.
 */
export const ACCESS: Record<Role, string[]> = {
  farmer: ['/farm', '/sim', '/verify', '/console/investor', '/console/market'],
  investor: ['/console/investor', '/console/market', '/verify'],
  researcher: ['/console/researcher', '/sim', '/verify'],
  admin: ['/farm', '/sim', '/verify', '/console'],
};

export function setRole(role: Role) {
  try {
    localStorage.setItem(KEY, role);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Private browsing. The session simply does not persist, which is fine.
  }
}

export function clearRole() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch { /* as above */ }
}

export function useRole() {
  const [role, setRoleState] = useState<Role | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        const saved = localStorage.getItem(KEY);
        setRoleState(saved && Object.hasOwn(ROLE_META, saved) ? saved as Role : null);
      } catch {
        setRoleState(null);
      }
      setReady(true);
    };
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);

  return { role, ready };
}

export function canAccess(role: Role | null, path: string): boolean {
  if (!role || !ACCESS[role]) return false;
  return ACCESS[role].some((p) => path === p || path.startsWith(p + '/'));
}
