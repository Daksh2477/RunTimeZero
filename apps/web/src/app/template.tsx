/**
 * Unlike layout.tsx this re-mounts on every navigation, which is what lets each
 * page arrive with a short entrance instead of snapping in. `@view-transition`
 * in globals.css only fires on full document loads, never on Next's client-side
 * navigation, so on its own it animated nothing between pages in the app.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
