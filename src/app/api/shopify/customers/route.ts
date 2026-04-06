import { NextResponse } from "next/server";
import { shopifyFetch } from "@/lib/shopify";

interface Order {
  id: number;
  name: string;
  created_at: string;
  total_price: string;
  customer: { id: number; first_name: string; last_name: string; email: string } | null;
  source_name: string;
}

export async function GET() {
  try {
    // Fetch last 90 days of orders
    const data = await shopifyFetch<{ orders: Order[] }>(
      "orders.json?limit=250&status=any&financial_status=paid&created_at_min=" +
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    );
    const orders = data.orders;

    // Aggregate by customer
    const customerMap: Record<number, {
      id: number;
      name: string;
      email: string;
      orderCount: number;
      totalSpend: number;
      firstOrder: string;
      lastOrder: string;
    }> = {};

    let totalRevenue = 0;
    let guestOrders = 0;

    for (const order of orders) {
      const amount = parseFloat(order.total_price);
      totalRevenue += amount;

      if (!order.customer) { guestOrders++; continue; }

      const cid = order.customer.id;
      if (!customerMap[cid]) {
        customerMap[cid] = {
          id: cid,
          name: `${order.customer.first_name} ${order.customer.last_name}`.trim(),
          email: order.customer.email,
          orderCount: 0,
          totalSpend: 0,
          firstOrder: order.created_at.substring(0, 10),
          lastOrder: order.created_at.substring(0, 10),
        };
      }
      customerMap[cid].orderCount++;
      customerMap[cid].totalSpend += amount;
      if (order.created_at < customerMap[cid].firstOrder) customerMap[cid].firstOrder = order.created_at.substring(0, 10);
      if (order.created_at > customerMap[cid].lastOrder) customerMap[cid].lastOrder = order.created_at.substring(0, 10);
    }

    const customers = Object.values(customerMap).sort((a, b) => b.totalSpend - a.totalSpend);
    const repeatCustomers = customers.filter(c => c.orderCount > 1);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    const repeatRate = customers.length > 0 ? (repeatCustomers.length / customers.length) * 100 : 0;

    return NextResponse.json({
      summary: {
        totalOrders: orders.length,
        uniqueCustomers: customers.length,
        repeatCustomers: repeatCustomers.length,
        repeatRate: Math.round(repeatRate * 10) / 10,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        guestOrders,
        totalRevenue,
      },
      topCustomers: customers.slice(0, 50),
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
