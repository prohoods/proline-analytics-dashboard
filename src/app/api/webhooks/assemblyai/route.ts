// AssemblyAI calls this when a transcription finishes.
// Payload: { transcript_id, status }
// We fetch the full transcript, run OpenAI classification, and store it.

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { fetchTranscript, classifyCall } from "@/lib/call-intelligence";

interface AssemblyAIWebhookPayload {
  transcript_id?: string;
  status?: string;
}

export async function POST(req: NextRequest) {
  let payload: AssemblyAIWebhookPayload;
  try {
    payload = (await req.json()) as AssemblyAIWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const transcriptId = payload.transcript_id;
  if (!transcriptId) {
    return NextResponse.json({ ok: false, error: "missing transcript_id" }, { status: 400 });
  }

  const sql = getSql();

  // Look up which call this belongs to. If we don't recognize the id, ignore.
  const [call] = await sql<
    {
      id: string;
      phone_e164: string;
      duration_seconds: number | null;
    }[]
  >`
    select id, phone_e164, duration_seconds
    from callrail_calls
    where assemblyai_id = ${transcriptId}
    limit 1
  `;
  if (!call) {
    return NextResponse.json({ ok: false, error: "unknown transcript_id" }, { status: 404 });
  }

  if (payload.status && payload.status !== "completed") {
    const errMsg = `AssemblyAI status: ${payload.status}`;
    await sql`
      update callrail_calls
      set transcription_status = 'error', error_message = ${errMsg}
      where id = ${call.id}
    `;
    return NextResponse.json({ ok: true, status: payload.status });
  }

  try {
    const t = await fetchTranscript(transcriptId);
    if (t.status !== "completed" || !t.text) {
      const errMsg = t.error || `AssemblyAI status: ${t.status}`;
      await sql`
        update callrail_calls
        set transcription_status = 'error', error_message = ${errMsg}
        where id = ${call.id}
      `;
      return NextResponse.json({ ok: false, error: errMsg }, { status: 200 });
    }

    await sql`
      update callrail_calls
      set transcript = ${t.text}, transcription_status = 'transcribed'
      where id = ${call.id}
    `;

    const classification = await classifyCall({
      transcript: t.text,
      customerPhone: call.phone_e164,
      durationSeconds: call.duration_seconds,
    });

    await sql`
      update callrail_calls
      set
        category = ${classification.category},
        summary = ${classification.summary},
        sentiment = ${classification.sentiment},
        key_points = ${sql.json(classification.key_points as never)},
        follow_up_needed = ${classification.follow_up_needed},
        transcription_status = 'classified',
        processed_at = now(),
        error_message = null
      where id = ${call.id}
    `;

    return NextResponse.json({ ok: true, callId: call.id, category: classification.category });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await sql`
      update callrail_calls
      set transcription_status = 'error', error_message = ${errMsg}
      where id = ${call.id}
    `;
    return NextResponse.json({ ok: false, error: errMsg }, { status: 200 });
  }
}
