// Backfill: re-submit existing CallRail calls through the AssemblyAI -> OpenAI
// pipeline. Useful right after migration to process calls that came in before
// the pipeline existed.
//
// Skips calls that are already in-flight or done. Defaults to last 30 days.

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  appBaseUrl,
  extractRecordingUrl,
  submitTranscription,
} from "@/lib/call-intelligence";

interface CallRow {
  id: string;
  payload: Record<string, unknown>;
  recording_url: string | null;
  assemblyai_id: string | null;
  transcription_status: string | null;
}

export async function POST(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "50"), 200);
  const sql = getSql();

  // Calls that have NOT been classified yet, ordered most recent first.
  const calls = await sql<CallRow[]>`
    select id, payload, recording_url, assemblyai_id, transcription_status
    from callrail_calls
    where call_started_at >= now() - (${days} || ' days')::interval
      and (
        transcription_status is null
        or transcription_status in ('pending', 'no_recording', 'error')
      )
      and assemblyai_id is null
    order by call_started_at desc
    limit ${limit}
  `;

  const baseUrl = appBaseUrl(req.headers.get("host"));
  const webhookUrl = `${baseUrl}/api/webhooks/assemblyai`;

  const results = {
    examined: calls.length,
    submitted: 0,
    skipped_no_recording: 0,
    errors: [] as { id: string; error: string }[],
  };

  for (const call of calls) {
    const recordingUrl =
      call.recording_url ?? extractRecordingUrl(call.payload ?? {});
    if (!recordingUrl) {
      await sql`
        update callrail_calls
        set transcription_status = 'no_recording'
        where id = ${call.id}
      `;
      results.skipped_no_recording++;
      continue;
    }

    try {
      const assemblyaiId = await submitTranscription({
        audioUrl: recordingUrl,
        webhookUrl,
      });
      await sql`
        update callrail_calls
        set
          recording_url = coalesce(recording_url, ${recordingUrl}),
          assemblyai_id = ${assemblyaiId},
          transcription_status = 'transcribing',
          error_message = null
        where id = ${call.id}
      `;
      results.submitted++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await sql`
        update callrail_calls
        set transcription_status = 'error', error_message = ${errMsg}
        where id = ${call.id}
      `;
      results.errors.push({ id: call.id, error: errMsg });
    }
  }

  return NextResponse.json({ ok: true, webhookUrl, ...results });
}
