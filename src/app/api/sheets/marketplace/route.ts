import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/google-sheets";

// 2026 Daily Sales Report — "Marketplace Sales" tab
// Columns: Date (MM/DD), Amazon, Wayfair, Home Depot, Gross Sales (less seller fees), Returns

export interface MarketplaceDay {
  date: string;   // YYYY-MM-DD
  amazon: number;
  wayfair: number;
  homeDepot: number;
  gross: number;
  returns: number;
  net: number;
}

export interface MarketplaceSummary {
  amazon: number;
  wayfair: number;
  homeDepot: number;
  gross: number;
  returns: number;
  net: number;
  days: MarketplaceDay[];
}

function parseNum(v: string | undefined) {
  if (!v) return 0;
  return parseFloat(v.replace(/[$,]/g, "")) || 0;
}

function toISO(mmdd: string, year = new Date().getFullYear()): string {
  // "01/05" → "2026-01-05"
  const [m, d] = mmdd.split("/");
  if (!m || !d) return "";
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export async function GET() {
  try {
    const sheetId = process.env.SALES_REPORT_SHEET_ID;
    if (!sheetId) {
      return NextResponse.json({ error: "SALES_REPORT_SHEET_ID not configured" }, { status: 500 });
    }

    // Sheet layout: A=Date, B=blank, C=Amazon, D=Wayfair, E=Home Depot, F-G=blank, H=Gross, I=Returns
    const rows = await getSheetData(sheetId, "Marketplace Sales!A2:I500");

    const days: MarketplaceDay[] = rows
      .filter(row => row[0] && row[0].includes("/"))
      .map(row => {
        const date = toISO(row[0]);
        const amazon = parseNum(row[2]);    // column C
        const wayfair = parseNum(row[3]);   // column D
        const homeDepot = parseNum(row[4]); // column E
        const gross = parseNum(row[7]) || (amazon + wayfair + homeDepot); // column H
        const returns = parseNum(row[8]);   // column I
        return { date, amazon, wayfair, homeDepot, gross, returns, net: gross - returns };
      })
      .filter(d => d.date);

    const summary: MarketplaceSummary = {
      amazon: days.reduce((s, d) => s + d.amazon, 0),
      wayfair: days.reduce((s, d) => s + d.wayfair, 0),
      homeDepot: days.reduce((s, d) => s + d.homeDepot, 0),
      gross: days.reduce((s, d) => s + d.gross, 0),
      returns: days.reduce((s, d) => s + d.returns, 0),
      net: days.reduce((s, d) => s + d.net, 0),
      days,
    };

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
