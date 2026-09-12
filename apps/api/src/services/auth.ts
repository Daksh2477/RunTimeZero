/**
 * Accounts, passwords and tokens — hand-rolled on `node:crypto`, no new deps.
 *
 * Two libraries would normally appear here: bcrypt and jsonwebtoken. Neither is
 * worth a dependency for what they do. scrypt ships in Node's standard library
 * and is a stronger password hash than bcrypt; HS256 is a SHA-256 HMAC over two
 * base64url segments, which is thirty lines. Both are written out below rather
 * than described, so anyone reviewing the auth can read all of it in one file.
 *
 * What this deliberately is NOT: a permission system. There is one check —
 * "is this request carrying a valid token, and whose" — and the routes decide
 * what to do with the answer. A prototype that grows a role matrix before it
 * has users ends up enforcing rules nobody agreed to.
 */

import {
  createHmac, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';

import { pool } from '../db/client.ts';

// promisify drops the options overload, and the options are the whole point:
// scrypt at default cost is far too cheap for a password.
const scrypt = promisify(scryptCb) as (
  password: string, salt: Buffer, keylen: number, options: ScryptOptions,
) => Promise<Buffer>;

/**
 * scrypt cost. 2^15 is ~100 ms here, which is the point — a password hash that
 * is fast to check is fast to crack.
 *
 * `maxmem` has to be raised alongside it: scrypt needs about 128 × N × r bytes,
 * so N = 32768 at r = 8 wants ~33 MB and Node's default ceiling is 32 MB. Left
 * unset, every hash throws "memory limit exceeded" and registration 500s with
 * nothing in the response to say why.
 */
const SCRYPT_N = 32_768;
const SCRYPT_MAXMEM = 96 * 1024 * 1024;
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export type Role = 'operator' | 'buyer' | 'researcher' | 'admin';
const ROLES: Role[] = ['operator', 'buyer', 'researcher', 'admin'];

export interface Account {
  id: string;
  username: string;
  role: Role;
  siteId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export class AuthError extends Error {
  // A plain field, not a constructor parameter property: the API runs under
  // `node --experimental-strip-types`, which erases types without rewriting
  // syntax, so `constructor(readonly status)` parses in tsc and dies at boot.
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Signing secret.
 *
 * When `AUTH_SECRET` is absent a random one is generated per process, which
 * means every restart invalidates every token. That is the right failure for a
 * prototype — annoying, obvious, and impossible to mistake for production — and
 * far better than a hardcoded default that ships to a server.
 */
let secret: Buffer | null = null;
function signingSecret(): Buffer {
  if (secret) return secret;
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.length >= 16) {
    secret = Buffer.from(configured, 'utf8');
  } else {
    secret = randomBytes(32);
    console.warn(
      '[auth] AUTH_SECRET is not set, so a random one was generated. Tokens '
      + 'will stop working the next time the API restarts. Set it in .env.',
    );
  }
  return secret;
}

// ---------------------------------------------------------------- passwords

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(
    password, Buffer.from(saltHex, 'hex'), expected.length,
    { N: Number(n), maxmem: SCRYPT_MAXMEM },
  );
  // Constant-time: a fast "wrong" leaks how much of the hash matched.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ------------------------------------------------------------------- tokens

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export interface TokenClaims {
  sub: string;
  username: string;
  role: Role;
  iat: number;
  exp: number;
}

export function signToken(account: Account): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: account.id,
    username: account.username,
    role: account.role,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  } satisfies TokenClaims));
  const signature = createHmac('sha256', signingSecret())
    .update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/** Claims if the token is genuine and unexpired, else null. Never throws. */
export function verifyToken(token: string): TokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];

  const expected = createHmac('sha256', signingSecret())
    .update(`${header}.${payload}`).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenClaims;
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (!ROLES.includes(claims.role)) return null;
    return claims;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------- accounts

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

function toAccount(r: Record<string, unknown>): Account {
  return {
    id: String(r.id),
    username: String(r.username),
    role: r.role as Role,
    siteId: r.site_id === null ? null : String(r.site_id),
    createdAt: (r.created_at as Date).toISOString(),
    lastLoginAt: r.last_login_at ? (r.last_login_at as Date).toISOString() : null,
  };
}

export async function register(input: Record<string, unknown>): Promise<Account> {
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (!USERNAME_RE.test(username)) {
    throw new AuthError(
      'Username must be 3–32 characters: letters, numbers, dot, dash or underscore, '
      + 'starting with a letter or number.',
    );
  }
  // Eight characters, and no composition rules. A rule that forces a symbol
  // produces "Password1!" and nothing safer.
  if (password.length < 8) {
    throw new AuthError('Password must be at least 8 characters.');
  }
  const role: Role = ROLES.includes(input.role as Role) ? input.role as Role : 'operator';
  const siteId = typeof input.siteId === 'string' && input.siteId ? input.siteId : null;

  const hash = await hashPassword(password);
  try {
    const { rows } = await pool.query(
      `INSERT INTO accounts (id, username, password_hash, role, site_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, role, site_id, created_at, last_login_at`,
      [randomUUID(), username, hash, role, siteId],
    );
    return toAccount(rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new AuthError('That username is taken.', 409);
    }
    throw err;
  }
}

export async function login(
  input: Record<string, unknown>,
): Promise<{ account: Account; token: string }> {
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  const { rows } = await pool.query(
    `SELECT id, username, password_hash, role, site_id, created_at, last_login_at
       FROM accounts WHERE username = $1`,
    [username],
  );
  const row = rows[0];

  // Same message and comparable work whether the username exists or not, so
  // the response cannot be used to enumerate accounts.
  const stored = row?.password_hash
    ?? 'scrypt$32768$00000000000000000000000000000000$00';
  const ok = await verifyPassword(password, stored);
  if (!row || !ok) throw new AuthError('Wrong username or password.', 401);

  await pool.query('UPDATE accounts SET last_login_at = now() WHERE id = $1', [row.id]);
  const account = toAccount({ ...row, last_login_at: new Date() });
  return { account, token: signToken(account) };
}

export async function getAccount(id: string): Promise<Account | null> {
  const { rows } = await pool.query(
    `SELECT id, username, role, site_id, created_at, last_login_at
       FROM accounts WHERE id = $1`,
    [id],
  );
  return rows[0] ? toAccount(rows[0]) : null;
}
