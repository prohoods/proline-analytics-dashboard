import { NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";
import { getShippingByOrder } from "@/lib/db";

// Returns YTD + MTD shipping totals per destination state. Driven by a single
// Shopify YTD orders fetch (cached 15 min) joined to the shipping_costs table.
// Used by the state detail modal so we can show "year-so-far" and
// "month-to-date" alongside the page's date-range averages.
export async function GET() {
  try {
    const today = new Date();
    const yearStart = `${today.getFullYear()}-01-01`;
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const todayStr = today.toISOString().slice(0, 10);

    const tz = "-07:00";
    const params = `created_at_min=${yearStart}T00:00:00${tz}&created_at_max=${todayStr}T23:59:59${tz}&financial_status=any`;
    const { orders } = await getOrders(params);

    const shippingByOrder = await getShippingByOrder(orders.map(o => o.name));

    type Totals = { ytdSpend: number; ytdShipments: number; mtdSpend: number; mtdShipments: number };
    const byState = new Map<string, Totals>();
    let allYtdSpend = 0;
    let allYtdShipments = 0;
    let allMtdSpend = 0;
    let allMtdShipments = 0;

    for (const order of orders) {
      const cost = shippingByOrder.get(order.name) ?? 0;
      if (cost <= 0) continue;
      const state = order.shipping_address?.province_code ?? "";
      const date = order.created_at.substring(0, 10);
      allYtdSpend += cost;
      allYtdShipments += 1;
      const isMtd = date >= monthStart;
      if (isMtd) { allMtdSpend += cost; allMtdShipments += 1; }
      if (!state) continue;
      const t = byState.get(state) ?? { ytdSpend: 0, ytdShipments: 0, mtdSpend: 0, mtdShipments: 0 };
      t.ytdSpend += cost;
      t.ytdShipments += 1;
      if (isMtd) { t.mtdSpend += cost; t.mtdShipments += 1; }
      byState.set(state, t);
    }

    const states = Array.from(byState.entries()).map(([state, t]) => ({ state, ...t }));

    return NextResponse.json({
      yearStart,
      monthStart,
      asOf: todayStr,
      total: { ytdSpend: allYtdSpend, ytdShipments: allYtdShipments, mtdSpend: allMtdSpend, mtdShipments: allMtdShipments },
      states,
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
