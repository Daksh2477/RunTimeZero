'use client';

/**
 * Stands between a signed-out visitor and the private screens.
 *
 * While the account is still being read it renders the page rather than a
 * holding screen. The check is a round trip to /auth/me on every hard load,
 * and replacing the whole page with "checking your account" for the length of
 * it made every navigation look like a dead site. A signed-out visitor still
 * gets the sign-in panel a moment later; a signed-in one never sees a flicker,
 * because the server already rendered their page with their cookie.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole, refreshSession } from '@/lib/session';
import { canAccess, isPublicPath, sessionHome } from '@/lib/auth-contract';

export function AccountGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { session, ready } = useRole();

  if (isPublicPath(path)) return children;
  if (!ready) return children;

  if (!session) {
    return (
      <main className="account-gate">
        <h1>Sign in to open your workspace</h1>
        <p>Your account connects you to the right ponds and tools.</p>
        <Link className="button" href={`/enter?next=${encodeURIComponent(path)}`}>Sign in →</Link>
        <Link className="button secondary" href="/sim">Try the public simulator</Link>
        <button className="button secondary" onClick={() => void refreshSession()}>Check connection again</button>
      </main>
    );
  }

  if (!canAccess(session.account.role, path)) {
    return (
      <main className="account-gate">
        <h1>This view belongs to a different role</h1>
        <p>Open the workspace assigned to your account.</p>
        <Link className="button" href={sessionHome(session)}>Open my workspace →</Link>
      </main>
    );
  }

  return children;
}
