/**
 * Clear telemetry so a demo starts from a clean live feed.
 *
 * Only raw readings go. Checks, batches, harvests and trades stay, because they
 * are the evidence trail other records point at. Run `npm run sim` afterwards
 * to refill the history.
 *
 *   npm run db:reset-readings
 */

import { pool } from '../apps/api/src/db/client.ts';

const { rowCount } = await pool.query('DELETE FROM telemetry');
await pool.query('UPDATE devices SET last_seen_at = NULL');
console.log(`deleted ${rowCount} readings`);
await pool.end();
