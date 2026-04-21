import { NextResponse } from "next/server";
import { getPersistedStatement } from "@/lib/persisted-statements";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getPersistedStatement(id);
  if (!record) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }
  return NextResponse.json({ statement: record });
}
