import { NextResponse } from 'next/server';
import { FixtureMetaClient, FixturePipesClient } from '@/lib/clients/fixtures';
import type { MetaClient, PipesClient } from '@/lib/clients/types';
import { timingSafeEqual } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { runDailyPipeline } from '@/lib/pipeline/run';

export const dynamic = 'force-dynamic';
// A full run touches 11 ad accounts across two APIs; the default 10s is not
// enough. Vercel Hobby caps at 60s, Pro at 300s.
export const maxDuration = 300;

/**
 * Daily refresh entrypoint (Vercel Cron).
 *
 * Scheduled `0 20 * * *` in vercel.json — 20:00 UTC daily, which is early
 * afternoon for the US-timezone ad accounts. Spec section 8 asks for an
 * afternoon run so Pipes revenue has settled before the pull.
 *
 * Daily rather than weekly, even though the report's cadence is Monday: the
 * trailing-30 figures move every day, and a failed pull self-heals tomorrow
 * instead of leaving stale numbers up for a week. Re-running is safe — each
 * run writes a new snapshot for the same report date, and the page reads the
 * newest complete one.
 *
 * Authenticates with CRON_SECRET rather than a session cookie, which is why
 * middleware excludes /api/cron/*.
 */
export async function GET(request: Request) {
  const cfg = getConfig();

  if (!cfg.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!timingSafeEqual(provided, cfg.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Live clients swap in here once the Phase 0 access spikes complete; until
  // then USE_FIXTURES keeps the whole pipeline exercisable.
  let meta: MetaClient;
  let pipes: PipesClient;

  if (cfg.USE_FIXTURES) {
    meta = new FixtureMetaClient();
    pipes = new FixturePipesClient();
  } else {
    return NextResponse.json(
      {
        error:
          'Live Meta/Pipes clients are not wired yet. Complete the Phase 0 access spikes, ' +
          'then set USE_FIXTURES=false.',
      },
      { status: 501 },
    );
  }

  try {
    const result = await runDailyPipeline({ meta, pipes });
    // 'partial' is still a 200: nine good accounts should publish. The status
    // field is what monitoring should alert on.
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
