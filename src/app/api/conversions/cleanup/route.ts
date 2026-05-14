// One-time cleanup: re-classify dead conversion_uploads rows as 'skipped'.
//
// These are rows we sent to Google Ads but Google rejected (or we should
// never have sent in the first place) because they were missing a click
// identifier. They're permanent failures — counting them against the
// success rate is misleading, and the retry cron should ignore them.
//
// Also normalizes empty-string click ids in callrail_calls to NULL so the
// downstream `gclid is not null` filter behaves correctly going forward.
//
// Usage: POST /api/conversions/cleanup

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export async function POST() {
  try {
    const sql = getSql();

    // 1. Normalize blank click IDs in callrail_calls → NULL.
    const callsCleaned = await sql<{ updated: number }[]>`
      with upd as (
        update callrail_calls
        set
          gclid = case when btrim(coalesce(gclid, '')) = '' then null else gclid end,
          gbraid = case when btrim(coalesce(gbraid, '')) = '' then null else gbraid end,
          wbraid = case when btrim(coalesce(wbraid, '')) = '' then null else wbraid end
        where (gclid is not null and btrim(gclid) = '')
           or (gbraid is not null and btrim(gbraid) = '')
           or (wbraid is not null and btrim(wbraid) = '')
        returning 1
      )
      select count(*)::int as updated from upd
    `;

    // 2. Same normalization on conversion_uploads (covers historical rows
    //    inserted before the upstream fix).
    const uploadsCleaned = await sql<{ updated: number }[]>`
      with upd as (
        update conversion_uploads
        set
          gclid = case when btrim(coalesce(gclid, '')) = '' then null else gclid end,
          gbraid = case when btrim(coalesce(gbraid, '')) = '' then null else gbraid end,
          wbraid = case when btrim(coalesce(wbraid, '')) = '' then null else wbraid end
        where (gclid is not null and btrim(gclid) = '')
           or (gbraid is not null and btrim(gbraid) = '')
           or (wbraid is not null and btrim(wbraid) = '')
        returning 1
      )
      select count(*)::int as updated from upd
    `;

    // 3. Re-classify dead errors as 'skipped'. Pattern: row has no click id,
    //    OR Google rejected with the permanent "required field" error.
    const reclassified = await sql<{ updated: number }[]>`
      with upd as (
        update conversion_uploads
        set status = 'skipped'
        where status = 'error'
          and (
            (gclid is null and gbraid is null and wbraid is null)
            or coalesce(error_message, '') ilike '%required field was not present%'
            or coalesce(error_message, '') ilike '%requires gclid%'
          )
        returning 1
      )
      select count(*)::int as updated from upd
    `;

    return NextResponse.json({
      ok: true,
      callrailBlanksNormalized: callsCleaned[0]?.updated ?? 0,
      uploadsBlanksNormalized: uploadsCleaned[0]?.updated ?? 0,
      errorsReclassifiedAsSkipped: reclassified[0]?.updated ?? 0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
