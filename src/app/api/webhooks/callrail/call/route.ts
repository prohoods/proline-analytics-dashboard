// CallRail call_completed webhook → record call + GCLID/GBRAID for later
// attribution when a Shopify order shows up under the same phone number.
//
// We do NOT upload a Phone Call Sale conversion here — that fires from the
// Shopify order webhook once a paid order is matched to this call.

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  appBaseUrl,
  extractRecordingUrl,
  submitTranscription,
} from "@/lib/call-intelligence";

const CALLRAIL_WEBHOOK_SECRET = process.env.CALLRAIL_WEBHOOK_SECRET ?? "";

// CallRail webhook payload (post_call). Field set varies by account; we read
// the keys we need defensively.
interface CallRailPayload {
  id?: string;
  call_id?: string;
  resource_id?: string;
  customer_phone_number?: string;
  caller_id?: string;
  start_time?: string;
  end_time?: string;
  duration?: number | string;
  ga_client_id?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  source?: string;
  utm_source?: string;
  [key: string]: unknown;
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

// CallRail webhook signature: HMAC-SHA1 of raw body, base64, in "signature" header.
// Optional — only enforced if CALLRAIL_WEBHOOK_SECRET is set.
function verifySignature(rawBody: string, headerSig: string | null): boolean {
  if (!CALLRAIL_WEBHOOK_SECRET) return true;
  if (!headerSig) return false;
  const digest = crypto
    .createHmac("sha1", CALLRAIL_WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(headerSig));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("signature");

  if (!verifySignature(rawBody, sig)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let payload: CallRailPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const id = payload.id || payload.call_id || payload.resource_id;
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing call id" }, { status: 400 });
  }

  const phone = normalizePhoneE164(
    payload.customer_phone_number || payload.caller_id
  );
  if (!phone) {
    return NextResponse.json({ ok: false, error: "missing phone" }, { status: 400 });
  }

  const startedAt = payload.start_time ? new Date(payload.start_time) : new Date();
  const endedAt = payload.end_time ? new Date(payload.end_time) : null;
  const duration =
    typeof payload.duration === "string"
      ? parseInt(payload.duration, 10)
      : payload.duration ?? null;

  const recordingUrl = extractRecordingUrl(payload as Record<string, unknown>);

  const sql = getSql();
  await sql`
    insert into callrail_calls (
      id, phone_e164, call_started_at, call_ended_at, duration_seconds,
      gclid, gbraid, wbraid, source, payload, recording_url
    ) values (
      ${id}, ${phone}, ${startedAt.toISOString()},
      ${endedAt ? endedAt.toISOString() : null}, ${duration ?? null},
      ${payload.gclid ?? null}, ${payload.gbraid ?? null}, ${payload.wbraid ?? null},
      ${payload.source ?? payload.utm_source ?? null}, ${sql.json(payload as never)},
      ${recordingUrl}
    )
    on conflict (id) do update set
      phone_e164 = excluded.phone_e164,
      call_ended_at = excluded.call_ended_at,
      duration_seconds = excluded.duration_seconds,
      gclid = coalesce(excluded.gclid, callrail_calls.gclid),
      gbraid = coalesce(excluded.gbraid, callrail_calls.gbraid),
      wbraid = coalesce(excluded.wbraid, callrail_calls.wbraid),
      source = coalesce(excluded.source, callrail_calls.source),
      payload = excluded.payload,
      recording_url = coalesce(excluded.recording_url, callrail_calls.recording_url)
  `;

  // Kick off transcription if we have a recording and haven't already.
  let transcriptionStarted = false;
  let transcriptionError: string | null = null;
  if (recordingUrl) {
    const [existing] = await sql<
      { assemblyai_id: string | null; transcription_status: string | null }[]
    >`
      select assemblyai_id, transcription_status from callrail_calls where id = ${id}
    `;
    if (!existing?.assemblyai_id) {
      try {
        const baseUrl = appBaseUrl(req.headers.get("host"));
        const assemblyaiId = await submitTranscription({
          audioUrl: recordingUrl,
          webhookUrl: `${baseUrl}/api/webhooks/assemblyai`,
        });
        await sql`
          update callrail_calls
          set assemblyai_id = ${assemblyaiId},
              transcription_status = 'transcribing',
              error_message = null
          where id = ${id}
        `;
        transcriptionStarted = true;
      } catch (err) {
        transcriptionError = err instanceof Error ? err.message : String(err);
        await sql`
          update callrail_calls
          set transcription_status = 'error',
              error_message = ${transcriptionError}
          where id = ${id}
        `;
      }
    }
  } else {
    await sql`
      update callrail_calls
      set transcription_status = coalesce(transcription_status, 'no_recording')
      where id = ${id}
    `;
  }

  return NextResponse.json({
    ok: true,
    id,
    phone,
    hasGclid: Boolean(payload.gclid || payload.gbraid || payload.wbraid),
    hasRecording: Boolean(recordingUrl),
    transcriptionStarted,
    transcriptionError,
  });
}
