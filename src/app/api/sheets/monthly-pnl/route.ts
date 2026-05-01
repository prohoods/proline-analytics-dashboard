import { NextResponse } from "next/server";
import { getSheetData, parseCurrency } from "@/lib/google-sheets";

// 2026 Daily Sales Report — "Monthly P&L" tab
// Columns mirror the Sheets layout:
//   A: Month (text — e.g. "January, 2026" or YYYY-MM)
//   B: Google Ad Shopping Cost
//   C: Connexity Ads
//   D: Bing Ads
//   E: Amazon Ads
//   F: Meta Ads
//   G: Pinterest Ads
//   H: TOTAL Ad Spend (computed in sheet — re-derived here so we don't trust stale cells)
//   I: blank gap
//   J: Site+Phone (revenue)
//   K: COGS+Tariffs
//   L: Company Refunds
//   M: Conv Value
//   N: Net Revenue
//   O: ROI (computed)
//   P: Blended ROAS (computed)
//   Q: Margin (computed)
//   R: Tariff note (free text — surfaced as `note`)
// All currency cells parse "$1,234.56" → number. Empty rows are skipped.

export interface MonthlyPnlRow {
  month: string;             // raw label from sheet (e.g. "January, 2026")
  ymKey: string;             // canonical YYYY-MM for sorting/joining
  googleAdShopping: number;
  connexity: number;
  bing: number;
  amazon: number;
  meta: number;
  pinterest: number;
  totalAdSpend: number;      // re-derived, not trusted from sheet
  sitePhone: number;
  cogsTariffs: number;
  companyRefunds: number;
  convValue: number;
  netRevenue: number;
  roi: number;               // netRevenue ÷ totalAdSpend
  blendedRoas: number;       // convValue ÷ totalAdSpend
  marginPct: number;         // netRevenue ÷ sitePhone
  note: string;
}

const MONTH_NAMES: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

// Convert "January, 2026" / "Jan 2026" / "2026-01" / "January 2026" → "2026-01"
function toYMKey(label: string): string {
  if (!label) return "";
  const trimmed = label.trim();
  // Already YYYY-MM
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  // YYYY/MM
  if (/^\d{4}\/\d{1,2}$/.test(trimmed)) {
    const [y, m] = trimmed.split("/");
    return `${y}-${m.padStart(2, "0")}`;
  }
  // Month name + year
  const m = trimmed.match(/^([A-Za-z]+)[,\s]+(\d{4})$/);
  if (m) {
    const mm = MONTH_NAMES[m[1].toLowerCase()];
    if (mm) return `${m[2]}-${mm}`;
  }
  return "";
}

function safeDiv(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0;
}

export async function GET() {
  try {
    const sheetId = process.env.SALES_REPORT_SHEET_ID;
    if (!sheetId) {
      return NextResponse.json({ error: "SALES_REPORT_SHEET_ID not configured" }, { status: 500 });
    }

    // Tab name contains '&' so it must be single-quoted for the Sheets API.
    const rows = await getSheetData(sheetId, "'Monthly P&L'!A2:R200");

    const data: MonthlyPnlRow[] = rows
      .filter(row => row[0] && row[0].trim() && toYMKey(row[0]))
      .map(row => {
        const googleAdShopping = parseCurrency(row[1] ?? "");
        const connexity = parseCurrency(row[2] ?? "");
        const bing = parseCurrency(row[3] ?? "");
        const amazon = parseCurrency(row[4] ?? "");
        const meta = parseCurrency(row[5] ?? "");
        const pinterest = parseCurrency(row[6] ?? "");
        const totalAdSpend = googleAdShopping + connexity + bing + amazon + meta + pinterest;
        const sitePhone = parseCurrency(row[9] ?? "");
        const cogsTariffs = parseCurrency(row[10] ?? "");
        const companyRefunds = parseCurrency(row[11] ?? "");
        const convValue = parseCurrency(row[12] ?? "");
        const netRevenue = parseCurrency(row[13] ?? "");
        return {
          month: row[0].trim(),
          ymKey: toYMKey(row[0]),
          googleAdShopping,
          connexity,
          bing,
          amazon,
          meta,
          pinterest,
          totalAdSpend,
          sitePhone,
          cogsTariffs,
          companyRefunds,
          convValue,
          netRevenue,
          roi: safeDiv(netRevenue, totalAdSpend),
          blendedRoas: safeDiv(convValue, totalAdSpend),
          marginPct: safeDiv(netRevenue, sitePhone) * 100,
          note: (row[17] ?? "").trim(),
        };
      })
      .sort((a, b) => a.ymKey.localeCompare(b.ymKey));

    const sum = (k: keyof MonthlyPnlRow) =>
      data.reduce((s, r) => s + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);

    const totalAdSpend = sum("totalAdSpend");
    const sitePhone = sum("sitePhone");
    const convValue = sum("convValue");
    const netRevenue = sum("netRevenue");

    const summary = {
      googleAdShopping: sum("googleAdShopping"),
      connexity: sum("connexity"),
      bing: sum("bing"),
      amazon: sum("amazon"),
      meta: sum("meta"),
      pinterest: sum("pinterest"),
      totalAdSpend,
      sitePhone,
      cogsTariffs: sum("cogsTariffs"),
      companyRefunds: sum("companyRefunds"),
      convValue,
      netRevenue,
      roi: safeDiv(netRevenue, totalAdSpend),
      blendedRoas: safeDiv(convValue, totalAdSpend),
      marginPct: safeDiv(netRevenue, sitePhone) * 100,
      monthCount: data.length,
    };

    return NextResponse.json({ months: data, summary }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
