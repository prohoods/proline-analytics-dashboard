import { NextResponse } from "next/server";
import { shopifyFetch } from "@/lib/shopify";

interface Order {
  id: number;
  name: string;
  created_at: string;
  fulfillment_status: string | null;
  financial_status: string;
  total_price: string;
  fulfillments: {
    created_at: string;
    status: string;
    tracking_company: string | null;
    tracking_number: string | null;
  }[];
  customer: { first_name: string; last_name: string } | null;
  line_items: { title: string; quantity: number }[];
}

export async function GET() {
  try {
    // Fetch recent orders including fulfillment data
    const data = await shopifyFetch<{ orders: Order[] }>(
      "orders.json?limit=250&status=any&financial_status=paid&created_at_min=" +
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    );
    const orders = data.orders;

    const unfulfilled = orders.filter(o => !o.fulfillment_status || o.fulfillment_status === "unfulfilled");
    const partial = orders.filter(o => o.fulfillment_status === "partial");
    const fulfilled = orders.filter(o => o.fulfillment_status === "fulfilled");

    // Avg fulfillment time (hours) for fulfilled orders
    const fulfillmentTimes = fulfilled
      .filter(o => o.fulfillments.length > 0)
      .map(o => {
        const orderTime = new Date(o.created_at).getTime();
        const fulfillTime = new Date(o.fulfillments[0].created_at).getTime();
        return (fulfillTime - orderTime) / (1000 * 60 * 60); // hours
      });
    const avgFulfillmentHours = fulfillmentTimes.length > 0
      ? fulfillmentTimes.reduce((s, t) => s + t, 0) / fulfillmentTimes.length
      : 0;

    // Unfulfilled orders detail
    const unfulfilledDetail = unfulfilled.map(o => ({
      name: o.name,
      customer: o.customer ? `${o.customer.first_name} ${o.customer.last_name}`.trim() : "Guest",
      orderDate: o.created_at.substring(0, 10),
      daysWaiting: Math.floor((Date.now() - new Date(o.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      total: parseFloat(o.total_price),
      items: o.line_items.map(li => `${li.title} (${li.quantity})`).join(", "),
    })).sort((a, b) => b.daysWaiting - a.daysWaiting);

    return NextResponse.json({
      summary: {
        totalOrders: orders.length,
        unfulfilled: unfulfilled.length,
        partial: partial.length,
        fulfilled: fulfilled.length,
        avgFulfillmentHours: Math.round(avgFulfillmentHours * 10) / 10,
        fulfillmentRate: orders.length > 0 ? (fulfilled.length / orders.length) * 100 : 0,
      },
      unfulfilledOrders: unfulfilledDetail,
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
