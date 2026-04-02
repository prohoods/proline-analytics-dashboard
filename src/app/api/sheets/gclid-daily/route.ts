import { NextResponse } from "next/server";
import { getSheetData, parseCurrency, parsePercent } from "@/lib/google-sheets";

export async function GET() {
  try {
    const sheetId = process.env.GCLID_SHEET_ID;
    if (!sheetId) return NextResponse.json({ error: "GCLID_SHEET_ID not set" }, { status: 500 });

    // Daily Summary tab: Date, Total Orders, Orders w/GCLID, Attribution Rate, Revenue All, Revenue Google, Ad Spend, ROAS
    const rows = await getSheetData(sheetId, "Daily Summary!A2:H200");

    const data = rows
      .filter((row) => row[0] && row[0].match(/^\d{4}-\d{2}-\d{2}$/))
      .map((row) => ({
        date: row[0],
        totalOrders: parseInt(row[1]) || 0,
        ordersWithGCLID: parseInt(row[2]) || 0,
        attributionRate: parsePercent(row[3]),
        revenueAll: parseCurrency(row[4]),
        revenueGoogle: parseCurrency(row[5]),
        adSpend: parseCurrency(row[6]),
        roas: parseFloat(row[7]) || 0,
      }));

    return NextResponse.json(data);
  } catch (err) {
    console.error("gclid-daily error:", err);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
