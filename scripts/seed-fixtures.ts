/**
 * Run the full pipeline against the FIXTURE clients and write a snapshot.
 *
 * This is what makes the dashboard demoable before the Meta and Pipes
 * credentials exist: same pipeline, same computation, same tables — only the
 * two source clients are swapped.
 *
 * Usage: npm run db:fixtures
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { FixtureMetaClient, FixturePipesClient } from '../lib/clients/fixtures';
import { runDailyPipeline } from '../lib/pipeline/run';
import { getSql } from '../lib/db/client';

async function main() {
  const result = await runDailyPipeline({
    meta: new FixtureMetaClient(),
    pipes: new FixturePipesClient(),
  });

  console.log(`\nSnapshot #${result.snapshotId} for ${result.reportDate}: ${result.status}\n`);
  for (const a of result.accounts) {
    const unjoined =
      a.unjoinedRevenuePct === null ? '' : ` · unjoined ${a.unjoinedRevenuePct.toFixed(1)}%`;
    const err = a.error ? ` · ${a.error}` : '';
    console.log(`  ${a.status.padEnd(9)} ${a.name}${unjoined}${err}`);
  }

  await getSql().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
