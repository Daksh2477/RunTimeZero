'use client';

/**
 * Choosing who you are.
 *
 * This answers a real complaint: every screen was reachable by everybody, so
 * a farmer could land in an investor's trade panel with no idea what they
 * were looking at. Picking a role here decides which console you get and
 * what the navigation offers.
 *
 * It is deliberately honest that this is not authentication — the note at
 * the bottom says so, and each role carries the sign-in method it would
 * really need. Pretending a role picker is a login would be the same kind of
 * overstatement this product exists to refuse.
 */

import { useRouter } from 'next/navigation';
import { ROLE_META, setRole, type Role } from '@/lib/session';

const ORDER: Role[] = ['farmer', 'investor', 'researcher', 'admin'];

const BLURB: Record<Role, string> = {
  farmer: 'See your ponds, what needs doing today, and sell what you earn.',
  investor: 'Buy verified credits, and find farms raising money.',
  researcher: 'License pond data and run the physics model yourself.',
  admin: 'Issue batches, manage consent, and see every site.',
};

export default function Enter() {
  const router = useRouter();

  const pick = (role: Role) => {
    setRole(role);
    router.push(ROLE_META[role].home);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Who are you here as?
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Each one gets a different console. You can switch at any time.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {ORDER.map((role) => {
          const m = ROLE_META[role];
          return (
            <button
              key={role}
              type="button"
              onClick={() => pick(role)}
              className="rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-accent"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-lg font-semibold">{m.label}</span>
                {!m.selfServe && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground">
                    invite only
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{m.tagline}</p>
              <p className="mt-3 text-sm">{BLURB[role]}</p>
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                Real sign-in would be: {m.authMode}
              </p>
            </button>
          );
        })}
      </div>

      <p className="mt-8 rounded-lg border border-border bg-secondary/60 p-4 text-xs text-muted-foreground">
        <strong className="text-foreground">This is not a login.</strong>{' '}
        It stores your choice in this browser so the app shows one audience&rsquo;s
        screens instead of all of them at once. Nothing here is protected by it —
        anything that genuinely must be would have to be enforced by the API.
        We would rather say that than draw a padlock.
      </p>
    </main>
  );
}
