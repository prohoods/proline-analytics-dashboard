import { NextResponse } from "next/server";
import { listPersistedStatements } from "@/lib/persisted-statements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const statements = await listPersistedStatements();
  // Strip heavy transaction payloads — list view only needs headline stats.
  const light = statements.map(s => ({
    id: s.id,
    fileName: s.fileName,
    uploadedAt: s.uploadedAt,
    account: s.parsed.account,
    periodStart: s.parsed.periodStart,
    periodEnd: s.parsed.periodEnd,
    beginBalance: s.parsed.beginBalance,
    endBalance: s.parsed.endBalance,
    totalCredits: s.parsed.totalCredits,
    totalDebits: s.parsed.totalDebits,
    transactionCount: s.parsed.transactions.length,
    uncategorized: s.summary.uncategorized,
    warnings: s.parsed.warnings,
  }));
  return NextResponse.json({ statements: light });
}
