import { NextRequest, NextResponse } from "next/server";
import { getSHLOrders } from "@/lib/shl-shopify";

// Mirrors /api/shopify/channel-orders for SHL — drives the SHL drill-in modal
// on the sales page so SHL cells are clickable like every other channel.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00&financial_status=any`;
    const { orders } = await getSHLOrders(params);

    const matched = orders.map(o => {
      const subtotal = parseFloat(o.subtotal_price);
      const totalPrice = parseFloat(o.total_price);
      const tax = parseFloat(o.total_tax);
      const discounts = parseFloat(o.total_discounts ?? "0");
      const shipping = Math.max(0, totalPrice - subtotal - tax);
      const refundedAmount = (o.refunds ?? []).reduce((s, r) =>
        s + (r.refund_line_items ?? []).reduce((rs, li) => rs + parseFloat(li.subtotal ?? "0"), 0)
      , 0);
      return {
        id: o.id,
        name: o.name,
        date: o.created_at.substring(0, 10),
        customer: "",
        email: "",
        subtotal,
        discounts,
        shipping,
        tax,
        total: totalPrice,
        refundedAmount,
        financialStatus: o.financial_status,
        tags: [] as string[],
      };
    }).sort((a, b) => b.subtotal - a.subtotal);

    return NextResponse.json({ orders: matched }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("shl order-list error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
