import { NextRequest, NextResponse } from "next/server";
import { getSheetData, parseCurrency, parsePercent } from "@/lib/google-sheets";

export async function GET(request: NextRequest) {
  try {
    const sheetId = process.env.MAIN_REPORTING_SHEET_ID;
    if (!sheetId) return NextResponse.json({ error: "MAIN_REPORTING_SHEET_ID not set" }, { status: 500 });

    const year = new URL(request.url).searchParams.get("year") ?? "2026";
    const tabName = year === "2025"
      ? "2025 Google Monthly Performance!A2:J30"
      : "Google Monthly Performance!A2:J30";

    // Month, Google Ad Shopping Cost, COGS+Tariffs, Company Refunds, Conv Value, Site+Phone, Reported Google ROAS, ROI, Net Revenue, Margin
    const rows = await getSheetData(sheetId, tabName);

    const data = rows
      .filter((row) => row[0])
      .map((row) => ({
        month: row[0],
        googleShoppingCost: parseCurrency(row[1]),
        cogsAndTariffs: parseCurrency(row[2]),
        companyRefunds: parseCurrency(row[3]),
        convValue: parseCurrency(row[4]),
        sitePlusPhone: parseCurrency(row[5]),
        reportedGoogleRoas: parseFloat(row[6]) || 0,
        roi: parseFloat(row[7]) || 0,
        netRevenue: parseCurrency(row[8]),
        margin: parsePercent(row[9]),
      }));

    return NextResponse.json(data);
  } catch (err) {
    console.error("google-monthly error:", err);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
