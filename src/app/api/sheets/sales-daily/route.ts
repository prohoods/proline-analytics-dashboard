import { NextResponse } from "next/server";
import { getSheetData, parseCurrency } from "@/lib/google-sheets";

export async function GET() {
  try {
    const sheetId = process.env.SALES_REPORT_SHEET_ID;
    if (!sheetId) return NextResponse.json({ error: "SALES_REPORT_SHEET_ID not set" }, { status: 500 });

    // Daily Sales tab: Row#, PRH Sales, PP Sales, Phone Sales, SHL Sales, Marketplaces, Refunds, Sales Tax, Net Sales
    const rows = await getSheetData(sheetId, "2026 Daily Sales!A2:I400");

    const data = rows
      .filter((row) => row[0] && (row[1] || row[8]))
      .map((row) => ({
        date: row[0], // MM/DD format e.g. "01/01"
        prhSales: parseCurrency(row[1]),
        ppSales: parseCurrency(row[2]),
        phoneSales: parseCurrency(row[3]),
        shlSales: parseCurrency(row[4]),
        marketplaces: parseCurrency(row[5]),
        refunds: parseCurrency(row[6]),
        salesTax: parseCurrency(row[7]),
        netSales: parseCurrency(row[8]),
      }))
      .filter((row) => row.prhSales !== 0 || row.phoneSales !== 0 || row.netSales !== 0);

    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sales-daily error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
