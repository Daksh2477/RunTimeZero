/**
 * Create or reset a demo account.
 *
 *   npm run db:account                      # admin / admin, role admin
 *   npm run db:account -- meera secret123 operator
 *
 * Inserted directly rather than through `POST /auth/register` because that
 * route requires eight characters and this exists to make `admin`/`admin`
 * work for a demo. The registration rule stays as it is: a four-character
 * password is fine for a login you type in front of an audience and not fine
 * as a policy for real accounts.
 */

import { pool } from '../apps/api/src/db/client.ts';
import { hashPassword, type Role } from '../apps/api/src/services/auth.ts';

const [username = 'admin', password = 'admin', role = 'admin'] = process.argv.slice(2);

async function main(): Promise<void> {
  // Bound to a site so the operator screens have something to show.
  const { rows: sites } = await pool.query('SELECT id, name FROM sites ORDER BY name LIMIT 1');
  const site = sites[0] ?? null;

  const { rows } = await pool.query(
    `INSERT INTO accounts (username, password_hash, role, site_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           site_id = EXCLUDED.site_id
     RETURNING id, username, role`,
    [username.toLowerCase(), await hashPassword(password), role as Role, site?.id ?? null],
  );

  console.log(
    `${rows[0].username} / ${password}  role=${rows[0].role}`
    + (site ? `  site=${site.name}` : '  (no site)'),
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
