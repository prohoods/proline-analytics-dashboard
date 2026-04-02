import { NextResponse } from "next/server";
import { getSheetData, parseCurrency } from "@/lib/google-sheets";

export async function GET() {
  try {
    const sheetId = process.env.MAIN_REPORTING_SHEET_ID;
    if (!sheetId) return NextResponse.json({ error: "MAIN_REPORTING_SHEET_ID not set" }, { status: 500 });

    // 2026 Monthly Ad Spend Performance tab
    // Columns: Month, Google Shopping Cost, Connexity, Bing, Amazon, Meta, Pinterest, Total Ad Spend
    // + right side: Site+Phone, COGS+Tariffs, Refunds, Conv Value, Net Revenue, ROI, Blended ROAS
    const rows = await getSheetData(sheetId, "2026 Monthly Ad Spend Performance!A2:O15");

    const data = rows
      .filter((row) => row[0] && !row[0].includes("TOTAL") && row[1])
      .map((row) => ({
        month: row[0],
        googleShopping: parseCurrency(row[1]),
        connexity: parseCurrency(row[2]),
        bing: parseCurrency(row[3]),
        amazon: parseCurrency(row[4]),
        meta: parseCurrency(row[5]),
        pinterest: parseCurrency(row[6]),
        totalAdSpend: parseCurrency(row[7]),
        sitePlusPhone: parseCurrency(row[9]),
        cogsAndTariffs: parseCurrency(row[10]),
        refunds: parseCurrency(row[11]),
        convValue: parseCurrency(row[12]),
        netRevenue: parseCurrency(row[13]),
        roi: parseFloat(row[14]) || 0,
        blendedRoas: parseFloat(row[15]) || 0,
      }));

    return NextResponse.json(data);
  } catch (err) {
    console.error("ad-spend error:", err);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
