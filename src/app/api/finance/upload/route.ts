import { NextRequest, NextResponse } from "next/server";
import { parseStatementText, type ParsedStatement } from "@/lib/statement-parser";
import { categorizeTransactions, categorizationSummary } from "@/lib/transaction-categorizer";
import { savePersistedStatement, type PersistedStatement } from "@/lib/persisted-statements";

export const runtime = "nodejs";
const MAX_BYTES = 25 * 1024 * 1024;

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  // pdfjs-dist legacy build runs under Node. Disable worker + fonts for server use.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // @ts-expect-error — GlobalWorkerOptions exists on the legacy build
  pdfjs.GlobalWorkerOptions.workerSrc = false;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Reconstruct lines by grouping items by their y-coordinate.
    // pdfjs items include transform matrix [a,b,c,d,e,f] where f = y.
    const lines: Record<string, { y: number; x: number; s: string }[]> = {};
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const key = String(y);
      if (!lines[key]) lines[key] = [];
      lines[key].push({ y, x, s: item.str });
    }
    const ordered = Object.values(lines)
      .sort((a, b) => b[0].y - a[0].y)
      .map(row => row.sort((a, b) => a.x - b.x).map(c => c.s).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    pageTexts.push(ordered.join("\n"));
  }
  return pageTexts.join("\n");
}

function csvToText(buffer: ArrayBuffer): string {
  // CSVs are already text — parser handles line-by-line extraction.
  return new TextDecoder("utf-8").decode(buffer);
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max 25 MB)` }, { status: 413 });
    }
    const name = file.name.toLowerCase();
    const isPdf = name.endsWith(".pdf");
    const isCsv = name.endsWith(".csv");
    if (!isPdf && !isCsv) {
      return NextResponse.json({ error: "Only PDF or CSV files accepted" }, { status: 415 });
    }

    const buffer = await file.arrayBuffer();
    let rawText: string;
    try {
      rawText = isPdf ? await extractPdfText(buffer) : csvToText(buffer);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Text extraction failed: ${msg}` }, { status: 422 });
    }

    const parsed: ParsedStatement = parseStatementText(rawText);
    categorizeTransactions(parsed.transactions);
    const summary = categorizationSummary(parsed.transactions);

    const id = `${parsed.account}-${parsed.periodStart || "unknown"}-${Date.now()}`;
    const record: PersistedStatement = {
      id,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      sizeBytes: file.size,
      parsed,
      summary,
    };

    const { url, persisted } = await savePersistedStatement(record);

    return NextResponse.json({
      ok: true,
      id,
      persisted,
      blobUrl: url,
      account: parsed.account,
      period: { start: parsed.periodStart, end: parsed.periodEnd },
      beginBalance: parsed.beginBalance,
      endBalance: parsed.endBalance,
      totalCredits: parsed.totalCredits,
      totalDebits: parsed.totalDebits,
      transactionCount: parsed.transactions.length,
      uncategorized: summary.uncategorized,
      warnings: parsed.warnings,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
