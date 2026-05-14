// Retry failed conversion uploads.
//
// Picks up rows from `conversion_uploads` where:
//   - status = 'error'
//   - it's the latest attempt for its dedupe_key
//   - no successful sibling exists for the same dedupe_key
//   - attempt < MAX_ATTEMPTS
//   - attempted_at is within the lookback window (default 7d)
//
// Each retry writes a NEW row (attempt = previous + 1) so we keep history.
//
// Usage: POST /api/conversions/retry?lookbackHours=168&max=200

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  executeUpload,
  type ConversionActionKey,
  type ConversionSource,
  CONVERSION_ACTION_IDS,
} from "@/lib/google-ads-conversions";

export const maxDuration = 300;

const MAX_ATTEMPTS = 5;

interface RetryCandidate {
  id: number;
  source: ConversionSource;
  source_id: string;
  conversion_action: ConversionActionKey;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  conversion_value: string | null;
  currency: string | null;
  conversion_at: Date;
  dedupe_key: string;
  attempt: number;
}

export async function POST(req: NextRequest) {
  const sql = getSql();
  const lookbackHours = Math.max(
    1,
    Math.min(168 * 4, Number(req.nextUrl.searchParams.get("lookbackHours") ?? "168"))
  );
  const max = Math.max(1, Math.min(500, Number(req.nextUrl.searchParams.get("max") ?? "200")));

  try {
    // Find candidates: latest attempt per dedupe_key that errored, attempts < cap,
    // and no successful sibling. Order oldest-first so retries don't starve.
    const candidates = await sql<RetryCandidate[]>`
      with latest as (
        select distinct on (dedupe_key)
          id, source, source_id, conversion_action,
          gclid, gbraid, wbraid, conversion_value, currency,
          conversion_at, dedupe_key, attempt, status
        from conversion_uploads
        where attempted_at >= now() - (${lookbackHours} || ' hours')::interval
          and dedupe_key is not null
        order by dedupe_key, attempt desc
      )
      select l.id, l.source, l.source_id, l.conversion_action,
             l.gclid, l.gbraid, l.wbraid, l.conversion_value, l.currency,
             l.conversion_at, l.dedupe_key, l.attempt
      from latest l
      join conversion_uploads cu on cu.id = l.id
      where l.status = 'error'
        and l.attempt < ${MAX_ATTEMPTS}
        and not exists (
          select 1 from conversion_uploads s
          where s.dedupe_key = l.dedupe_key and s.status = 'success'
        )
        -- Skip known-permanent failures so the cron doesn't bang on them daily.
        and coalesce(cu.error_message, '') not ilike '%click-through window%'
        and coalesce(cu.error_message, '') not ilike '%requires gclid%'
        and coalesce(cu.error_message, '') not ilike '%required field was not present%'
      order by l.attempt asc, l.id asc
      limit ${max}
    `;

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    const errors: { id: number; error: string }[] = [];

    for (const c of candidates) {
      // Double-check inside the loop in case a parallel webhook just succeeded.
      const stillNeeded = await sql<{ exists: boolean }[]>`
        select exists (
          select 1 from conversion_uploads
          where dedupe_key = ${c.dedupe_key} and status = 'success'
        ) as exists
      `;
      if (stillNeeded[0]?.exists) {
        skipped++;
        continue;
      }

      const conversionActionId = CONVERSION_ACTION_IDS[c.conversion_action];
      const value = c.conversion_value ? parseFloat(c.conversion_value) : 1;
      const currency = c.currency ?? "USD";

      // Insert a fresh attempt row.
      const [newRow] = await sql<{ id: number }[]>`
        insert into conversion_uploads (
          source, source_id, conversion_action, conversion_action_id,
          gclid, gbraid, wbraid,
          conversion_value, currency, conversion_at, status,
          dedupe_key, attempt
        ) values (
          ${c.source}, ${c.source_id}, ${c.conversion_action}, ${conversionActionId},
          ${c.gclid}, ${c.gbraid}, ${c.wbraid},
          ${value}, ${currency}, ${new Date(c.conversion_at).toISOString()}, 'pending',
          ${c.dedupe_key}, ${c.attempt + 1}
        )
        returning id
      `;

      const result = await executeUpload({
        uploadId: newRow.id,
        source: c.source,
        sourceId: c.source_id,
        conversionAction: c.conversion_action,
        gclid: c.gclid,
        gbraid: c.gbraid,
        wbraid: c.wbraid,
        conversionAt: new Date(c.conversion_at),
        value,
        currency,
      });

      if (result.status === "success") succeeded++;
      else {
        failed++;
        if (result.error) errors.push({ id: newRow.id, error: result.error });
      }
    }

    return NextResponse.json({
      ok: true,
      window: { lookbackHours, max, maxAttempts: MAX_ATTEMPTS },
      candidates: candidates.length,
      succeeded,
      failed,
      skipped,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
