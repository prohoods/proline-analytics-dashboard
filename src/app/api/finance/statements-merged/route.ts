import { NextResponse } from "next/server";
import { listPersistedStatements } from "@/lib/persisted-statements";
import { statements as baselineStatements } from "@/lib/financial-data";
import { buildMonthsFromUploads, mergeStatements } from "@/lib/parsed-to-monthdata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const uploads = await listPersistedStatements();
    const uploadedMonths = buildMonthsFromUploads(uploads);
    const merged = mergeStatements(baselineStatements, uploadedMonths);
    return NextResponse.json({
      statements: merged,
      uploadedMonthCount: uploadedMonths.length,
      baselineMonthCount: baselineStatements.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, statements: baselineStatements }, { status: 500 });
  }
}
