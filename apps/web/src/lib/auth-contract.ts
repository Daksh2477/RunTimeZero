export type Role = 'operator' | 'buyer' | 'researcher' | 'admin';
export interface Account { id: string; username: string; role: Role; siteId: string | null; createdAt?: string; lastLoginAt?: string | null; }
export interface Session { account: Account; landingPath?: string; permissions?: string[]; scope?: { siteIds: string[]; allSites: boolean }; }
export const ROLE_META: Record<Role, { label: string; home: string; tagline: string }> = {
  operator: { label: 'Farm operator', home: '/farm', tagline: 'Monitor your ponds and respond to alerts' },
  buyer: { label: 'Buyer', home: '/console/market', tagline: 'Review batches, retire credits and browse produce' },
  researcher: { label: 'Researcher', home: '/console/researcher', tagline: 'Explore datasets and the pond model' },
  admin: { label: 'Administrator', home: '/console/admin', tagline: 'Manage issuance, sites and data consent' },
};
export const ACCESS: Record<Role, string[]> = {
  operator: ['/hardware','/farm','/sim','/verify','/console/market','/console/pond','/console/site'],
  buyer: ['/hardware','/console/market','/console/investor','/verify','/sim'],
  researcher: ['/hardware','/console/researcher','/sim','/verify'],
  admin: ['/hardware','/farm','/console','/verify','/sim'],
};
export function canAccess(role: Role | null, path: string): boolean { return !!role && (ACCESS[role] ?? []).some(p=>path===p || path.startsWith(p+'/')); }
export function isPublicPath(path: string): boolean { return path==='/' || path==='/enter' || path==='/sim' || path==='/hardware' || path.startsWith('/circuit/') || path==='/console/market' || path==='/verify' || path.startsWith('/verify/'); }
export function isSession(value: unknown): value is Session { const a=(value as Session | null)?.account; return !!a && typeof a.id==='string' && typeof a.username==='string' && Object.hasOwn(ROLE_META,a.role); }
export function sessionHome(session: Session): string { const path=session.landingPath;return path?.startsWith('/') && !path.startsWith('//') && canAccess(session.account.role,path) ? path : ROLE_META[session.account.role].home; }
export function siteAllowed(session: Session, id: string): boolean { return session.account.role==='admin' || (session.scope?.allSites === true) || (session.scope?.siteIds ?? [session.account.siteId]).includes(id); }
