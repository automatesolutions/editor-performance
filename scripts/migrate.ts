/**
 * Apply SQL migrations in order. Idempotent: every migration uses
 * `create table if not exists`, and applied names are recorded.
 *
 * Usage: npm run db:migrate
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const sql = postgres(url, { max: 1 });

  await sql`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const dir = join(process.cwd(), 'db', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  const applied = new Set(
    (await sql<Array<{ name: string }>>`select name from schema_migrations`).map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file} (already applied)`);
      continue;
    }
    const contents = await readFile(join(dir, file), 'utf8');
    await sql.unsafe(contents);
    await sql`insert into schema_migrations (name) values (${file})`;
    console.log(`  apply ${file}`);
  }

  await sql.end();
  console.log('Migrations up to date.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
