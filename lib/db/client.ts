/**
 * Postgres connection. One pooled client per process, reused across requests
 * so a serverless invocation does not open a new connection per render.
 */

import postgres from 'postgres';
import { getConfig } from '../config';

declare global {
  // eslint-disable-next-line no-var
  var __epr_sql: ReturnType<typeof postgres> | undefined;
}

export function getSql() {
  if (!globalThis.__epr_sql) {
    globalThis.__epr_sql = postgres(getConfig().DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      // Cents are bigint in the schema but always well inside Number.MAX_SAFE_INTEGER
      // at these volumes, so parse them as numbers rather than strings.
      types: {
        bigint: postgres.BigInt,
      },
      transform: { undefined: null },
    });
  }
  return globalThis.__epr_sql;
}
