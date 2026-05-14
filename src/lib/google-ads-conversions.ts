// Upload offline click conversions to Google Ads.
// Every attempt is logged to `conversion_uploads` for audit + retry.
//
// Two layers of idempotency:
//   1. Our own: dedupe_key = `{source}-{source_id}-{conversion_action}`.
//      If a row with this key already succeeded, we never upload again.
//   2. Google's: the API's `orderId` field dedupes purchases within 55 days
//      on Google's side. We pass it whenever a stable per-conversion id exists.

import {
  API_VERSION,
  GOOGLE_ADS_CUSTOMER_ID,
  GOOGLE_ADS_DEVELOPER_TOKEN,
  getAccessToken,
} from "./google-ads";
import { getSql } from "./db";

export type ConversionSource = "shopify" | "callrail";
export type ConversionActionKey =
  | "offline_purchase"
  | "offline_purchase_gbraid"
  | "phone_call_sale";

export const CONVERSION_ACTION_IDS: Record<ConversionActionKey, string> = {
  offline_purchase: "7229053395",
  offline_purchase_gbraid: "7462689812",
  phone_call_sale: "7067163555",
};

export interface UploadClickConversionInput {
  source: ConversionSource;
  sourceId: string;
  conversionAction: ConversionActionKey;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  conversionAt: Date;
  value?: number | null;
  currency?: string;
}

export interface UploadClickConversionResult {
  status: "success" | "error" | "skipped";
  error?: string;
  uploadId: number | null;
  reason?: string;
}

function dedupeKey(input: { source: string; sourceId: string; conversionAction: string }): string {
  return `${input.source}-${input.sourceId}-${input.conversionAction}`;
}

// Treat empty / whitespace-only click identifiers as missing. Upstream sources
// (CallRail, Shopify note_attributes) sometimes send "" instead of omitting
// the field — we shouldn't pass those to Google, which rejects them with an
// opaque "required field was not present" error.
function normalizeClickId(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = String(v).trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Google Ads expects YYYY-MM-DD HH:MM:SS+TZ (e.g. "2026-05-07 14:23:01-04:00").
function formatConversionDateTime(d: Date): string {
  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? "+" : "-";
  const abs = Math.abs(tzMin);
  const tzH = String(Math.floor(abs / 60)).padStart(2, "0");
  const tzM = String(abs % 60).padStart(2, "0");
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${tzH}:${tzM}`
  );
}

// Perform the actual upload + update an existing pending row to success/error.
// Pulled out so the retry endpoint can reuse it on a freshly-inserted attempt.
export async function executeUpload(params: {
  uploadId: number;
  source: ConversionSource;
  sourceId: string;
  conversionAction: ConversionActionKey;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  conversionAt: Date;
  value: number;
  currency: string;
}): Promise<UploadClickConversionResult> {
  const sql = getSql();
  const conversionActionId = CONVERSION_ACTION_IDS[params.conversionAction];

  try {
    const accessToken = await getAccessToken();
    const conversion: Record<string, unknown> = {
      conversionAction: `customers/${GOOGLE_ADS_CUSTOMER_ID}/conversionActions/${conversionActionId}`,
      conversionDateTime: formatConversionDateTime(params.conversionAt),
      conversionValue: params.value,
      currencyCode: params.currency,
      // orderId gives Google a stable handle to dedupe purchases on their side
      // (55-day window). We scope it the same way as our dedupe_key.
      orderId: `${params.source}-${params.sourceId}-${params.conversionAction}`,
    };
    if (params.gclid) conversion.gclid = params.gclid;
    if (params.gbraid) conversion.gbraid = params.gbraid;
    if (params.wbraid) conversion.wbraid = params.wbraid;

    const res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${GOOGLE_ADS_CUSTOMER_ID}:uploadClickConversions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversions: [conversion],
          partialFailure: true,
          validateOnly: false,
        }),
        cache: "no-store",
      }
    );

    // Read as text first so non-JSON error pages (HTML redirects, 502 pages)
    // surface their real content instead of failing with "Unexpected token <".
    const rawText = await res.text();
    type GoogleBody = { partialFailureError?: { message?: string } } & Record<string, unknown>;
    let body: GoogleBody;
    try {
      body = JSON.parse(rawText) as GoogleBody;
    } catch {
      body = { _nonJson: true, status: res.status, snippet: rawText.slice(0, 500) };
    }
    const partialFailure = body.partialFailureError;
    if (!res.ok || partialFailure) {
      const msg = partialFailure
        ? partialFailure.message ?? JSON.stringify(partialFailure)
        : `Google Ads API ${res.status}: ${rawText.slice(0, 300)}`;
      await sql`
        update conversion_uploads
        set status = 'error', error_message = ${msg}, google_response = ${sql.json(body as never)}
        where id = ${params.uploadId}
      `;
      return { status: "error", error: msg, uploadId: params.uploadId };
    }

    await sql`
      update conversion_uploads
      set status = 'success', google_response = ${sql.json(body as never)}
      where id = ${params.uploadId}
    `;
    return { status: "success", uploadId: params.uploadId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`
      update conversion_uploads
      set status = 'error', error_message = ${msg}
      where id = ${params.uploadId}
    `;
    return { status: "error", error: msg, uploadId: params.uploadId };
  }
}

export async function uploadClickConversion(
  input: UploadClickConversionInput
): Promise<UploadClickConversionResult> {
  const sql = getSql();
  const conversionActionId = CONVERSION_ACTION_IDS[input.conversionAction];
  const currency = input.currency ?? "USD";
  const value = input.value ?? 1;
  // Normalize once; downstream code can rely on null-or-non-empty.
  const gclid = normalizeClickId(input.gclid);
  const gbraid = normalizeClickId(input.gbraid);
  const wbraid = normalizeClickId(input.wbraid);
  const key = dedupeKey({
    source: input.source,
    sourceId: input.sourceId,
    conversionAction: input.conversionAction,
  });

  // Dedupe: if this logical conversion already succeeded, do nothing.
  // Shopify retries webhooks aggressively on any 5xx — without this we'd
  // double-upload on every retry storm.
  const existing = await sql<{ id: number }[]>`
    select id from conversion_uploads
    where dedupe_key = ${key} and status = 'success'
    limit 1
  `;
  if (existing.length > 0) {
    return {
      status: "skipped",
      uploadId: existing[0].id,
      reason: "already uploaded",
    };
  }

  const [logRow] = await sql<{ id: number }[]>`
    insert into conversion_uploads (
      source, source_id, conversion_action, conversion_action_id,
      gclid, gbraid, wbraid,
      conversion_value, currency, conversion_at, status,
      dedupe_key, attempt
    ) values (
      ${input.source}, ${input.sourceId}, ${input.conversionAction}, ${conversionActionId},
      ${gclid}, ${gbraid}, ${wbraid},
      ${value}, ${currency}, ${input.conversionAt.toISOString()}, 'pending',
      ${key}, 1
    )
    returning id
  `;
  const uploadId = logRow.id;

  if (!gclid && !gbraid && !wbraid) {
    const msg = "missing gclid/gbraid/wbraid — cannot attribute click";
    await sql`
      update conversion_uploads
      set status = 'skipped', error_message = ${msg}
      where id = ${uploadId}
    `;
    return { status: "skipped", reason: msg, uploadId };
  }

  // phone_call_sale and offline_purchase actions only accept gclid; reject
  // upfront if we only have gbraid/wbraid, since Google will 400 anyway.
  const gclidOnlyActions: ConversionActionKey[] = ["phone_call_sale", "offline_purchase"];
  if (gclidOnlyActions.includes(input.conversionAction) && !gclid) {
    const msg = `${input.conversionAction} requires gclid (have gbraid/wbraid only)`;
    await sql`
      update conversion_uploads
      set status = 'skipped', error_message = ${msg}
      where id = ${uploadId}
    `;
    return { status: "skipped", reason: msg, uploadId };
  }

  return executeUpload({
    uploadId,
    source: input.source,
    sourceId: input.sourceId,
    conversionAction: input.conversionAction,
    gclid,
    gbraid,
    wbraid,
    conversionAt: input.conversionAt,
    value,
    currency,
  });
}
