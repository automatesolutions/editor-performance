import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * Health endpoint: last run, per-account outcome, and the section 4 unjoined
 * diagnostic. This is what monitoring should watch — a 'partial' snapshot or a
 * climbing unjoined percentage both mean the numbers on the page are less
 * trustworthy than they look.
 */
export async function GET() {
  const sql = getSql();

  const [snapshot] = await sql<
    Array<{ id: string; report_date: Date; status: string; pulled_at: Date }>
  >`
    select id, report_date, status, pulled_at
    from report_snapshots
    order by created_at desc
    limit 1
  `;

  if (!snapshot) {
    return NextResponse.json({ status: 'no_runs' }, { status: 503 });
  }

  const accounts = await sql<
    Array<{
      name: string;
      status: string;
      error_message: string | null;
      unjoined_revenue_pct: string | null;
    }>
  >`
    select a.name, sa.status, sa.error_message, sa.unjoined_revenue_pct
    from snapshot_accounts sa
    join accounts a on a.id = sa.account_id
    where sa.snapshot_id = ${snapshot.id}
    order by a.display_order
  `;

  const failed = accounts.filter((a) => a.status === 'failed');

  return NextResponse.json(
    {
      snapshotId: Number(snapshot.id),
      reportDate: snapshot.report_date.toISOString().slice(0, 10),
      status: snapshot.status,
      pulledAt: snapshot.pulled_at.toISOString(),
      accountsTotal: accounts.length,
      accountsFailed: failed.length,
      accounts: accounts.map((a) => ({
        name: a.name,
        status: a.status,
        error: a.error_message,
        unjoinedRevenuePct:
          a.unjoined_revenue_pct === null ? null : Number(a.unjoined_revenue_pct),
      })),
    },
    { status: snapshot.status === 'complete' ? 200 : 207 },
  );
}
