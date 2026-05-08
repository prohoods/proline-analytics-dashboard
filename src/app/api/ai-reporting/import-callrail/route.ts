// Pulls recent call rows from the CallRail API into callrail_calls.
// Idempotent: ON CONFLICT(id) DO UPDATE keeps existing transcription state.
// After running this, hit /api/ai-reporting/backfill to push the new calls
// through AssemblyAI + OpenAI.

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

const CALLRAIL_API_KEY = process.env.CALLRAIL_API_KEY ?? "";
const CALLRAIL_ACCOUNT_ID = process.env.CALLRAIL_ACCOUNT_ID ?? "";

interface CallRailCall {
  id: string;
  start_time?: string;
  end_time?: string;
  duration?: number;
  customer_phone_number?: string;
  caller_id?: string;
  recording?: string;
  source?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  ga_client_id?: string;
  [key: string]: unknown;
}

interface CallsResponse {
  page: number;
  per_page: number;
  total_pages: number;
  total_records: number;
  calls: CallRailCall[];
}

function authHeader() {
  return { authorization: `Token token="${CALLRAIL_API_KEY}"` };
}

function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function discoverAccountId(): Promise<string> {
  if (CALLRAIL_ACCOUNT_ID) return CALLRAIL_ACCOUNT_ID;
  const res = await fetch("https://api.callrail.com/v3/a.json", {
    headers: authHeader(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`CallRail accounts ${res.status}: ${text}`);
  const data = JSON.parse(text) as { accounts: { id: string }[] };
  const id = data.accounts?.[0]?.id;
  if (!id) throw new Error("CallRail returned no accounts");
  return id;
}

async function fetchPage(
  accountId: string,
  startDate: string,
  endDate: string,
  page: number
): Promise<CallsResponse> {
  const fields = [
    "recording",
    "source",
    "gclid",
    "duration",
    "customer_phone_number",
  ].join(",");
  const url = new URL(`https://api.callrail.com/v3/a/${accountId}/calls.json`);
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("per_page", "250");
  url.searchParams.set("page", String(page));
  url.searchParams.set("fields", fields);

  const res = await fetch(url.toString(), { headers: authHeader() });
  const text = await res.text();
  if (!res.ok) throw new Error(`CallRail calls ${res.status}: ${text}`);
  return JSON.parse(text) as CallsResponse;
}

export async function POST(req: NextRequest) {
  if (!CALLRAIL_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "CALLRAIL_API_KEY not set" },
      { status: 500 }
    );
  }

  const days = Math.max(
    1,
    Math.min(180, Number(req.nextUrl.searchParams.get("days") ?? "30"))
  );

  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  try {
    const accountId = await discoverAccountId();
    const sql = getSql();

    let page = 1;
    let totalSeen = 0;
    let inserted = 0;
    let updated = 0;
    let skippedNoPhone = 0;

    // Cap pages so a runaway response can't lock the function.
    while (page <= 20) {
      const data = await fetchPage(accountId, startDate, endDate, page);
      if (!data.calls?.length) break;
      totalSeen += data.calls.length;

      for (const call of data.calls) {
        const phone = normalizePhoneE164(
          call.customer_phone_number ?? call.caller_id ?? null
        );
        if (!phone) {
          skippedNoPhone++;
          continue;
        }

        const startedAt = call.start_time ? new Date(call.start_time) : null;
        const endedAt = call.end_time ? new Date(call.end_time) : null;
        const duration =
          typeof call.duration === "number" ? call.duration : null;
        const recordingUrl =
          typeof call.recording === "string" && call.recording.startsWith("http")
            ? call.recording
            : null;

        const before = await sql<{ id: string }[]>`
          select id from callrail_calls where id = ${call.id} limit 1
        `;
        const wasNew = before.length === 0;

        await sql`
          insert into callrail_calls (
            id, phone_e164, call_started_at, call_ended_at, duration_seconds,
            gclid, gbraid, wbraid, source, payload, recording_url
          ) values (
            ${call.id}, ${phone},
            ${startedAt ? startedAt.toISOString() : new Date().toISOString()},
            ${endedAt ? endedAt.toISOString() : null},
            ${duration},
            ${call.gclid ?? null}, ${call.gbraid ?? null}, ${call.wbraid ?? null},
            ${call.source ?? null}, ${sql.json(call as never)}, ${recordingUrl}
          )
          on conflict (id) do update set
            phone_e164 = excluded.phone_e164,
            call_ended_at = coalesce(excluded.call_ended_at, callrail_calls.call_ended_at),
            duration_seconds = coalesce(excluded.duration_seconds, callrail_calls.duration_seconds),
            gclid = coalesce(excluded.gclid, callrail_calls.gclid),
            gbraid = coalesce(excluded.gbraid, callrail_calls.gbraid),
            wbraid = coalesce(excluded.wbraid, callrail_calls.wbraid),
            source = coalesce(excluded.source, callrail_calls.source),
            payload = excluded.payload,
            recording_url = coalesce(excluded.recording_url, callrail_calls.recording_url)
        `;
        if (wasNew) inserted++;
        else updated++;
      }

      if (page >= data.total_pages) break;
      page++;
    }

    return NextResponse.json({
      ok: true,
      accountId,
      window: { startDate, endDate, days },
      totalSeen,
      inserted,
      updated,
      skippedNoPhone,
      nextStep:
        "POST /api/ai-reporting/backfill?days=" +
        days +
        "&limit=200 to transcribe + classify newly imported calls",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
