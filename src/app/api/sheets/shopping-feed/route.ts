import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/google-sheets";

// Sheet: Proline Range Hoods - Reporting
// Tab: Shopping Feed
// Columns: Campaign Name, Advertising Channel, Product ID, Impressions, Clicks, Cost, Conversions, Revenue

export interface ShoppingFeedRow {
  campaignName: string;
  channel: string;
  productId: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
}

export async function GET() {
  try {
    const sheetId = process.env.SHOPPING_FEED_SHEET_ID;
    if (!sheetId) {
      return NextResponse.json({ error: "SHOPPING_FEED_SHEET_ID not configured" }, { status: 500 });
    }

    const rows = await getSheetData(sheetId, "Shopping Feed!A2:H2000");

    const data: ShoppingFeedRow[] = rows
      .filter(row => row.length >= 4 && row[0]) // must have at least campaign name + some data
      .map(row => {
        const impressions = parseNum(row[3]);
        const clicks = parseNum(row[4]);
        const cost = parseNum(row[5]);
        const conversions = parseNum(row[6]);
        const revenue = parseNum(row[7]);

        return {
          campaignName: row[0] ?? "",
          channel: row[1] ?? "",
          productId: row[2] ?? "",
          impressions,
          clicks,
          cost,
          conversions,
          revenue,
          roas: cost > 0 ? revenue / cost : 0,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? cost / clicks : 0,
        };
      });

    // Summary totals
    const totals = data.reduce(
      (acc, row) => ({
        impressions: acc.impressions + row.impressions,
        clicks: acc.clicks + row.clicks,
        cost: acc.cost + row.cost,
        conversions: acc.conversions + row.conversions,
        revenue: acc.revenue + row.revenue,
      }),
      { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 }
    );

    return NextResponse.json(
      {
        rows: data,
        totals: {
          ...totals,
          roas: totals.cost > 0 ? totals.revenue / totals.cost : 0,
          ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
          cpc: totals.clicks > 0 ? totals.cost / totals.clicks : 0,
        },
        rowCount: data.length,
      },
      {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=60" },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[$,%]/g, "").replace(/,/g, "")) || 0;
}
