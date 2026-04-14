import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/google-sheets";

// Sheet layout: A=Month, B=Clicks, C=Cost
const SHEET_ID = "1fLt0-SHrjDaBx2R33nEN50OPrm1byWt1K9o85nDvLRg";

function parseNum(v?: string) {
  if (!v) return 0;
  return parseFloat(v.replace(/[$,%]/g, "").replace(/,/g, "")) || 0;
}

export async function GET() {
  try {
    const rows = await getSheetData(SHEET_ID, "Connexity!A2:C2000");

    const data = rows
      .filter(r => r[0] && r[2])
      .map(r => ({
        month: r[0],
        clicks: parseNum(r[1]),
        cost: parseNum(r[2]),
      }));

    const totalCost = data.reduce((s, r) => s + r.cost, 0);
    const totalClicks = data.reduce((s, r) => s + r.clicks, 0);

    return NextResponse.json({ rows: data, totals: { cost: totalCost, clicks: totalClicks } }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
