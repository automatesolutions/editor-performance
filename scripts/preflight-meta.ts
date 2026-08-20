/**
 * Verify Meta Marketing API access for all 11 ad accounts (Phase 0a).
 *
 * Checks each account is reachable with the configured token, prints its name
 * and reporting timezone, and offers to persist those timezones — which is
 * what the week and trailing-30 boundaries are derived from.
 *
 * Usage:
 *   npm run preflight:meta            # check only
 *   npm run preflight:meta -- --save  # also write timezones to accounts.timezone
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import postgres from 'postgres';
import { ACCOUNT_SEEDS } from '../lib/config/accounts-seed';

const API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

interface AccountInfo {
  name: string;
  timezone: string;
  currency: string;
}

async function fetchAccount(metaAccountId: string, token: string): Promise<AccountInfo> {
  const url =
    `https://graph.facebook.com/${API_VERSION}/act_${metaAccountId}` +
    `?fields=name,timezone_name,currency&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url);
  const body = (await res.json()) as Record<string, any>;

  if (!res.ok) {
    const err = body?.error;
    throw new Error(
      err ? `${err.type ?? 'Error'} ${err.code ?? ''}: ${err.message}` : `HTTP ${res.status}`,
    );
  }

  return {
    name: body.name ?? '(unnamed)',
    timezone: body.timezone_name ?? '(unknown)',
    currency: body.currency ?? '?',
  };
}

async function main() {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    console.error('META_ACCESS_TOKEN is not set. See docs/phase-0-access.md.');
    process.exit(1);
  }

  const save = process.argv.includes('--save');
  const timezones = new Map<number, string>();
  let ok = 0;
  let failed = 0;

  console.log(`Checking 11 ad accounts against Marketing API ${API_VERSION}...\n`);

  for (const seed of ACCOUNT_SEEDS) {
    for (const metaId of seed.metaAccountIds) {
      try {
        const info = await fetchAccount(metaId, token);
        ok++;
        console.log(
          `  OK    ${metaId.padEnd(17)} ${info.name.padEnd(26)} ${info.timezone} (${info.currency})`,
        );

        const existing = timezones.get(seed.id);
        if (existing && existing !== info.timezone) {
          // Only possible for X-ALL MPC. Their windows would span slightly
          // different days, which is worth knowing about explicitly.
          console.log(
            `        ! ${seed.name} spans ad accounts in different timezones ` +
              `(${existing} vs ${info.timezone}) — windows will not align exactly.`,
          );
        }
        timezones.set(seed.id, info.timezone);
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  FAIL  ${metaId.padEnd(17)} ${seed.name.padEnd(26)} ${message}`);
      }
    }
  }

  console.log(`\n${ok} reachable, ${failed} failed.`);

  if (save && timezones.size > 0) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const sql = postgres(url, { max: 1 });
    for (const [accountId, tz] of timezones) {
      await sql`update accounts set timezone = ${tz} where id = ${accountId}`;
    }
    await sql.end();
    console.log(`Saved ${timezones.size} account timezones.`);
  } else if (timezones.size > 0) {
    console.log('Re-run with --save to persist these timezones to accounts.timezone.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
