import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/google-sheets";

const SHEET_ID = "1fLt0-SHrjDaBx2R33nEN50OPrm1byWt1K9o85nDvLRg";

export async function GET() {
  try {
    const rows = await getSheetData(SHEET_ID, "Connexity!A2:E2000");

    const data = rows
      .filter(r => r.length >= 2 && r[0])
      .map(r => {
        const clicks = parseNum(r[1]);
        const cost = parseNum(r[2]);
        const orders = parseNum(r[3]);
        const revenue = parseNum(r[4]);
        return {
          month: r[0] ?? "",
          clicks, cost, orders, revenue,
          roas: cost > 0 ? revenue / cost : 0,
          cpc: clicks > 0 ? cost / clicks : 0,
          convRate: clicks > 0 ? (orders / clicks) * 100 : 0,
        };
      });

    const clk = data.reduce((s, r) => s + r.clicks, 0);
    const cost = data.reduce((s, r) => s + r.cost, 0);
    const orders = data.reduce((s, r) => s + r.orders, 0);
    const rev = data.reduce((s, r) => s + r.revenue, 0);
    const months = Array.from(new Set(data.map(r => r.month))).sort().reverse();

    return NextResponse.json({
      rows: data,
      totals: { clicks: clk, cost, orders, revenue: rev,
        roas: cost > 0 ? rev / cost : 0,
        cpc: clk > 0 ? cost / clk : 0,
        convRate: clk > 0 ? (orders / clk) * 100 : 0 },
      months,
    }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=60" } });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

function parseNum(v?: string) {
  if (!v) return 0;
  return parseFloat(v.replace(/[$,%]/g, "").replace(/,/g, "")) || 0;
}
