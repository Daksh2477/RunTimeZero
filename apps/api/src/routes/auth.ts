/**
 * Register, log in, and say who you are.
 *
 * Tokens go in `Authorization: Bearer <token>`, not a cookie: the console is a
 * separate origin from the API, and a cookie that works across origins needs
 * CSRF protection that a username-and-password prototype does not need to grow.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';

import {
  AuthError, getAccount, login, register, verifyToken, type Role, type TokenClaims,
} from '../services/auth.ts';

export const authRouter = Router();

/** The caller, when a valid token was presented. */
export interface Authenticated extends Request {
  account?: TokenClaims;
}

function send(res: Response, err: unknown) {
  if (err instanceof AuthError) return res.status(err.status).json({ error: err.message });
  console.error('[auth]', err);
  return res.status(500).json({ error: 'Could not complete that.' });
}

authRouter.post('/register', async (req, res) => {
  try {
    const account = await register((req.body ?? {}) as Record<string, unknown>);
    // Registering logs you in. A prototype that makes you type the password
     // twice in a row is just a worse prototype.
    const { token } = await login({
      username: account.username,
      password: (req.body as Record<string, unknown>).password,
    });
    return res.status(201).json({ account, token });
  } catch (err) {
    return send(res, err);
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { account, token } = await login((req.body ?? {}) as Record<string, unknown>);
    return res.json({ account, token });
  } catch (err) {
    return send(res, err);
  }
});

/** Who the current token belongs to, straight from the database. */
authRouter.get('/me', async (req: Authenticated, res) => {
  const claims = req.account;
  if (!claims) return res.status(401).json({ error: 'Not signed in.' });
  const account = await getAccount(claims.sub);
  if (!account) return res.status(401).json({ error: 'That account no longer exists.' });
  return res.json({ account });
});

/**
 * Attach the caller to every request that carries a token.
 *
 * Never rejects. A bad token is the same as no token, and the routes that care
 * say so themselves — middleware that 401s globally breaks every public page
 * the moment it is mounted.
 */
export function readToken(req: Authenticated, _res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token) {
    const claims = verifyToken(token);
    if (claims) req.account = claims;
  }
  next();
}

/** Refuse the request unless it is signed in. */
export function requireAuth(req: Authenticated, res: Response, next: NextFunction): void {
  if (!req.account) {
    res.status(401).json({ error: 'Sign in to do that.' });
    return;
  }
  next();
}

/** Refuse the request unless it is signed in with one of these roles. */
export function requireRole(...roles: Role[]) {
  return (req: Authenticated, res: Response, next: NextFunction): void => {
    if (!req.account) {
      res.status(401).json({ error: 'Sign in to do that.' });
      return;
    }
    if (!roles.includes(req.account.role)) {
      res.status(403).json({
        error: `This is for ${roles.join(' or ')} accounts. Yours is ${req.account.role}.`,
      });
      return;
    }
    next();
  };
}

/**
 * Gate reads only once the console can actually log in.
 *
 * `AUTH_ENFORCE_READS=true` turns the operator screens private. It is off by
 * default because the console does not have a login screen yet, and flipping
 * it before that ships would just show the user an empty dashboard. Mutations
 * are gated unconditionally — see server.ts.
 */
export function requireAuthForReads(
  req: Authenticated, res: Response, next: NextFunction,
): void {
  if (process.env.AUTH_ENFORCE_READS !== 'true') {
    next();
    return;
  }
  requireAuth(req, res, next);
}
