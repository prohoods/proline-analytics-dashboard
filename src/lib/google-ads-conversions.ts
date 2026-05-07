// Upload offline click conversions to Google Ads.
// Every attempt is logged to `conversion_uploads` for audit + retry.

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
  status: "success" | "error";
  error?: string;
  uploadId: number;
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

export async function uploadClickConversion(
  input: UploadClickConversionInput
): Promise<UploadClickConversionResult> {
  const sql = getSql();
  const conversionActionId = CONVERSION_ACTION_IDS[input.conversionAction];
  const currency = input.currency ?? "USD";
  const value = input.value ?? 1;

  const [logRow] = await sql<{ id: number }[]>`
    insert into conversion_uploads (
      source, source_id, conversion_action, conversion_action_id,
      gclid, gbraid, wbraid,
      conversion_value, currency, conversion_at, status
    ) values (
      ${input.source}, ${input.sourceId}, ${input.conversionAction}, ${conversionActionId},
      ${input.gclid ?? null}, ${input.gbraid ?? null}, ${input.wbraid ?? null},
      ${value}, ${currency}, ${input.conversionAt.toISOString()}, 'pending'
    )
    returning id
  `;
  const uploadId = logRow.id;

  if (!input.gclid && !input.gbraid && !input.wbraid) {
    const msg = "missing gclid/gbraid/wbraid — cannot attribute click";
    await sql`
      update conversion_uploads
      set status = 'error', error_message = ${msg}
      where id = ${uploadId}
    `;
    return { status: "error", error: msg, uploadId };
  }

  try {
    const accessToken = await getAccessToken();
    const conversion: Record<string, unknown> = {
      conversionAction: `customers/${GOOGLE_ADS_CUSTOMER_ID}/conversionActions/${conversionActionId}`,
      conversionDateTime: formatConversionDateTime(input.conversionAt),
      conversionValue: value,
      currencyCode: currency,
    };
    if (input.gclid) conversion.gclid = input.gclid;
    if (input.gbraid) conversion.gbraid = input.gbraid;
    if (input.wbraid) conversion.wbraid = input.wbraid;

    const res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:uploadClickConversions`,
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

    const body = await res.json();
    const partialFailure = body?.partialFailureError;
    if (!res.ok || partialFailure) {
      const msg = partialFailure
        ? partialFailure.message ?? JSON.stringify(partialFailure)
        : `Google Ads API error ${res.status}: ${JSON.stringify(body)}`;
      await sql`
        update conversion_uploads
        set status = 'error', error_message = ${msg}, google_response = ${sql.json(body)}
        where id = ${uploadId}
      `;
      return { status: "error", error: msg, uploadId };
    }

    await sql`
      update conversion_uploads
      set status = 'success', google_response = ${sql.json(body)}
      where id = ${uploadId}
    `;
    return { status: "success", uploadId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`
      update conversion_uploads
      set status = 'error', error_message = ${msg}
      where id = ${uploadId}
    `;
    return { status: "error", error: msg, uploadId };
  }
}
