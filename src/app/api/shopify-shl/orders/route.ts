import { NextRequest, NextResponse } from "next/server";
import { getSHLOrders, getSHLOrderRefunds } from "@/lib/shl-shopify";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end date required" }, { status: 400 });
    }

    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00&financial_status=any`;
    const { orders } = await getSHLOrders(params);

    // Fetch refunds
    const refundMap: Record<number, number> = {};
    const ordersWithRefunds = orders.filter(o =>
      (o.refunds && o.refunds.length > 0) ||
      o.financial_status === "refunded" ||
      o.financial_status === "partially_refunded"
    );

    await Promise.all(
      ordersWithRefunds.map(async (order) => {
        const refunds = await getSHLOrderRefunds(order.id);
        const amount = refunds.reduce((sum, r) => {
          const lineItemTotal = r.refund_line_items?.reduce(
            (s, li) => s + parseFloat(li.subtotal ?? "0") + parseFloat(li.total_tax ?? "0"), 0
          ) ?? 0;
          const txTotal = lineItemTotal === 0
            ? r.transactions?.reduce((s, t) => s + parseFloat(t.amount ?? "0"), 0) ?? 0
            : 0;
          return sum + (lineItemTotal > 0 ? lineItemTotal : txTotal);
        }, 0);
        refundMap[order.id] = amount;
      })
    );

    // Aggregate by day
    const dailyMap: Record<string, {
      date: string; orders: number; grossRevenue: number; refunds: number; netRevenue: number; tax: number;
    }> = {};

    let totalGross = 0, totalRefunds = 0, totalOrders = 0;

    for (const order of orders) {
      const date = order.created_at.substring(0, 10);
      if (!dailyMap[date]) {
        dailyMap[date] = { date, orders: 0, grossRevenue: 0, refunds: 0, netRevenue: 0, tax: 0 };
      }
      const gross = parseFloat(order.total_price);
      const tax = parseFloat(order.total_tax);
      const refundAmount = refundMap[order.id] ?? 0;

      dailyMap[date].orders += 1;
      dailyMap[date].grossRevenue += gross;
      dailyMap[date].refunds += refundAmount;
      dailyMap[date].tax += tax;
      dailyMap[date].netRevenue += gross - refundAmount;

      totalGross += gross;
      totalRefunds += refundAmount;
      totalOrders += 1;
    }

    const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      daily,
      summary: {
        totalOrders,
        grossRevenue: totalGross,
        totalRefunds,
        netRevenue: totalGross - totalRefunds,
        dateRange: { start, end },
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
