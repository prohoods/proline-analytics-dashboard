import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sql = getSql();
  try {
    const rows = await sql<
      {
        id: string;
        phone_e164: string;
        call_started_at: Date;
        duration_seconds: number | null;
        recording_url: string | null;
        transcript: string | null;
        transcription_status: string | null;
        category: string | null;
        summary: string | null;
        sentiment: string | null;
        key_points: string[] | null;
        follow_up_needed: boolean | null;
        error_message: string | null;
      }[]
    >`
      select id, phone_e164, call_started_at, duration_seconds,
             recording_url, transcript, transcription_status,
             category, summary, sentiment, key_points,
             follow_up_needed, error_message
      from callrail_calls
      where id = ${id}
      limit 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, call: rows[0] });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
