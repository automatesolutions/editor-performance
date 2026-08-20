/**
 * Seed the config tables from the spec's section 1 roster.
 *
 * Idempotent: re-running updates names and Meta account mappings but does NOT
 * overwrite target_roas or spend_floor_cents, because those are meant to be
 * edited in the database (spec section 1: "targets and the spend floor live in
 * this table, not in code"). Clobbering an operator's confirmed target on
 * every deploy would defeat the point.
 *
 * Usage: npm run db:seed
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import postgres from 'postgres';
import {
  ACCOUNT_SEEDS,
  DEFAULT_SPEND_FLOOR_CENTS,
  EDITOR_TOKEN_SEEDS,
} from '../lib/config/accounts-seed';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const sql = postgres(url, { max: 1 });

  for (const seed of ACCOUNT_SEEDS) {
    await sql`
      insert into accounts (
        id, name, slug, target_roas, spend_floor_cents, timezone,
        pipes_project, display_order
      ) values (
        ${seed.id}, ${seed.name}, ${seed.slug}, ${seed.targetRoas},
        ${DEFAULT_SPEND_FLOOR_CENTS}, ${seed.timezone},
        ${seed.pipesProject}, ${seed.id}
      )
      on conflict (id) do update set
        name = excluded.name,
        slug = excluded.slug,
        pipes_project = excluded.pipes_project,
        display_order = excluded.display_order
    `;

    for (const [i, metaId] of seed.metaAccountIds.entries()) {
      await sql`
        insert into meta_ad_accounts (meta_account_id, account_id, is_primary)
        values (${metaId}, ${seed.id}, ${i === 0})
        on conflict (meta_account_id) do update set
          account_id = excluded.account_id,
          is_primary = excluded.is_primary
      `;
    }

    const target = seed.targetRoas === null ? 'target not set' : `${seed.targetRoas}x`;
    console.log(`  ${seed.id.toString().padStart(2)}  ${seed.name} (${target})`);
  }

  for (const token of EDITOR_TOKEN_SEEDS) {
    await sql`
      insert into editor_tokens (token) values (${token})
      on conflict (token) do nothing
    `;
  }

  const rows = await sql<Array<{ count: string }>>`
    select count(*) from accounts where target_roas is null
  `;
  const nullTargets = rows[0]?.count ?? '0';

  console.log(`\nSeeded ${ACCOUNT_SEEDS.length} accounts, ${EDITOR_TOKEN_SEEDS.length} tokens.`);
  console.log(`${nullTargets} accounts have no target set (expected: 3).`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
