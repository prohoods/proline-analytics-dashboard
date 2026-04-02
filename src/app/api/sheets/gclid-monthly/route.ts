import { NextResponse } from "next/server";
import { getSheetData, parseCurrency, parsePercent } from "@/lib/google-sheets";

export async function GET() {
  try {
    const sheetId = process.env.GCLID_SHEET_ID;
    if (!sheetId) return NextResponse.json({ error: "GCLID_SHEET_ID not set" }, { status: 500 });

    // Monthly Summary tab: Month, Total Orders, Orders w/GCLID, Attribution Rate, Revenue All, Revenue Google, Ad Spend, ROAS, Cost per Acquisition
    const rows = await getSheetData(sheetId, "Monthly Summary!A2:I50");

    const data = rows
      .filter((row) => row[0])
      .map((row) => ({
        month: row[0],
        totalOrders: parseInt(row[1]) || 0,
        ordersWithGCLID: parseInt(row[2]) || 0,
        attributionRate: parsePercent(row[3]),
        revenueAll: parseCurrency(row[4]),
        revenueGoogle: parseCurrency(row[5]),
        adSpend: parseCurrency(row[6]),
        roas: parseFloat(row[7]) || 0,
        costPerAcquisition: parseCurrency(row[8]),
      }));

    return NextResponse.json(data);
  } catch (err) {
    console.error("gclid-monthly error:", err);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
