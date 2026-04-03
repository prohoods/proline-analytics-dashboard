import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end date required" }, { status: 400 });
    }

    // Fetch all orders in range (Shopify max 250 per page)
    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00&financial_status=any`;
    const data = await getOrders(params);
    const orders = data.orders;

    // Aggregate daily totals
    const dailyMap: Record<string, {
      date: string;
      orders: number;
      grossRevenue: number;
      refunds: number;
      netRevenue: number;
      tax: number;
    }> = {};

    let totalGross = 0;
    let totalRefunds = 0;
    let totalOrders = 0;

    for (const order of orders) {
      const date = order.created_at.substring(0, 10);
      if (!dailyMap[date]) {
        dailyMap[date] = { date, orders: 0, grossRevenue: 0, refunds: 0, netRevenue: 0, tax: 0 };
      }
      const gross = parseFloat(order.total_price);
      const tax = parseFloat(order.total_tax);
      const refundAmount = order.refunds.reduce((sum, r) =>
        sum + r.transactions.reduce((s, t) => s + parseFloat(t.amount), 0), 0
      );

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
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("shopify orders error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
