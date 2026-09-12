/**
 * The old "all ponds" console.
 *
 * Its layout — counts, filters, search, ponds grouped by site — is now what
 * /farm uses, with live reading cards in the grid instead of verdict-only
 * tiles. Two pages listing the same ponds two different ways was the confusion;
 * this redirects rather than 404s so older links and bookmarks still land
 * somewhere sensible.
 */

import { redirect } from 'next/navigation';

export default function ConsolePage() {
  redirect('/farm');
}
