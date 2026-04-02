import { NextResponse } from "next/server";
import { getSheetData, parseCurrency } from "@/lib/google-sheets";

export async function GET() {
  try {
    const sheetId = process.env.SALES_REPORT_SHEET_ID;
    if (!sheetId) return NextResponse.json({ error: "SALES_REPORT_SHEET_ID not set" }, { status: 500 });

    // Monthly Sales tab: #, Month, PRH Sales, PP Sales, Phone Sales, SHL Sales, Marketplaces, Refunds, Taxes, Net Sales
    const rows = await getSheetData(sheetId, "2026 Monthly Sales!A2:J20");

    const data = rows
      .filter((row) => row[1])
      .map((row) => ({
        index: row[0],
        month: row[1],
        prhSales: parseCurrency(row[2]),
        ppSales: parseCurrency(row[3]),
        phoneSales: parseCurrency(row[4]),
        shlSales: parseCurrency(row[5]),
        marketplaces: parseCurrency(row[6]),
        refunds: parseCurrency(row[7]),
        taxes: parseCurrency(row[8]),
        netSales: parseCurrency(row[9]),
      }));

    return NextResponse.json(data);
  } catch (err) {
    console.error("sales-monthly error:", err);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
