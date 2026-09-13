/**
 * pm2 configuration for a VPS deploy.
 *
 * Reads credentials from `.env` rather than carrying them inline, so this file
 * is safe to commit and there is one place to change a password.
 *
 * Two things this deliberately does NOT share with anything else on the box:
 * its database and its Node version. The interpreter is resolved to a local
 * nvm-installed Node 22 because `--experimental-strip-types` does not exist in
 * Node 20, and the system Node must stay untouched for whatever else is
 * already running here.
 *
 *   pm2 start ecosystem.config.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;

/** Minimal .env parser — no dependency, and it only needs to handle KEY=value. */
function readEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found. Copy .env.example and fill it in.`);
  }
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    // Values are taken literally: a DATABASE_URL can contain '=' and quotes
    // would end up inside the connection string.
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Newest locally installed Node 22, or fall back to whatever is on PATH.
 *
 * Hardcoding a patch version breaks the day nvm upgrades, so this globs for
 * the highest v22 it can find.
 */
function findNode22() {
  const dir = path.join(process.env.HOME || '/root', '.nvm/versions/node');
  try {
    const v22 = fs
      .readdirSync(dir)
      .filter((d) => d.startsWith('v22.'))
      .sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }),
      );
    if (v22.length > 0) return path.join(dir, v22[0], 'bin/node');
  } catch {
    // nvm not installed — fall through.
  }
  return 'node';
}

const env = { ...readEnv(), NODE_ENV: 'production' };
const interpreter = findNode22();

module.exports = {
  apps: [
    {
      name: 'algacarbon-api',
      cwd: ROOT,
      script: 'apps/api/src/server.ts',
      interpreter,
      // Node 22 needs the flag explicitly; 23+ strips types by default.
      interpreter_args: '--experimental-strip-types',
      // This box also runs a live product. A runaway process here restarts
      // itself rather than starving everything else.
      max_memory_restart: '250M',
      autorestart: true,
      env,
    },
    {
      name: 'algacarbon-web',
      cwd: path.join(ROOT, 'apps/web'),
      script: path.join(ROOT, 'node_modules/next/dist/bin/next'),
      args: `start -p ${env.WEB_PORT || '3300'}`,
      interpreter,
      max_memory_restart: '300M',
      autorestart: true,
      env,
    },
    {
      name: 'algacarbon-sim',
      cwd: ROOT,
      script: 'scripts/sim-driver.ts',
      // Local mode: reads DATABASE_URL directly, no SIM_REMOTE. Scoped to one
      // pond on purpose — drop --pond entirely to drive the whole fleet.
      args: '--pond c5a2d6a7-15c4-4164-a942-31aefbe2b09a --speed 1 --backdate 14',
      interpreter,
      interpreter_args: '--experimental-strip-types',
      // Small and quiet compared to the API/web apps; a runaway loop here
      // still shouldn't be allowed to starve either of them.
      max_memory_restart: '150M',
      autorestart: true,
      // SIM_API_URL isn't in .env — the script defaults to :4000, which is
      // the dev port, not this box's real API_PORT. Only this app gets the
      // override; algacarbon-api/-web keep the shared `env` object as-is.
      env: { ...env, SIM_API_URL: `http://localhost:${env.API_PORT || '4300'}` },
    },
  ],
};
