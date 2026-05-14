// Debug: breakdown of conversion_uploads so we can see what's failing.
// GET /api/debug/conversion-errors

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export async function GET() {
  const sql = getSql();
  const [byStatus, errorSamples, recentSuccess, customerIdLen] = await Promise.all([
    sql<{ status: string; count: number }[]>`
      select status, count(*)::int as count
      from conversion_uploads
      group by status
    `,
    sql`
      select id, source, source_id, conversion_action, conversion_action_id,
             gclid, gbraid, wbraid, status, error_message,
             attempt, dedupe_key, attempted_at
      from conversion_uploads
      where status = 'error'
      order by attempted_at desc
      limit 5
    `,
    sql`
      select id, source, source_id, conversion_action, conversion_action_id,
             attempted_at
      from conversion_uploads
      where status = 'success'
      order by attempted_at desc
      limit 3
    `,
    Promise.resolve({
      env_customer_id_length: (process.env.GOOGLE_ADS_CUSTOMER_ID ?? "").length,
      env_customer_id_has_dash: (process.env.GOOGLE_ADS_CUSTOMER_ID ?? "").includes("-"),
    }),
  ]);

  return NextResponse.json({
    byStatus,
    errorSamples,
    recentSuccess,
    env: customerIdLen,
  });
}
