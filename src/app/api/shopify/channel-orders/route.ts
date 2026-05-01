import { NextRequest, NextResponse } from "next/server";
import { getOrdersWithRefundsInWindow, ShopifyOrder } from "@/lib/shopify";

// Mirror the classification rules from /api/shopify/channel-sales so the
// drill-in modal lists exactly the orders that were summed into each cell.
type Channel = "prh" | "prolinePro" | "phone" | "other" | "skip";

const STATUS_TAGS = new Set(["REFUNDED", "redo_claim"]);
const MARKETPLACE_TAGS = new Set(["Market Place Order", "Marketplace"]);

function classifyOrder(order: ShopifyOrder): Channel {
  const allTags = order.tags.split(",").map(t => t.trim()).filter(Boolean);
  if (allTags.some(t => MARKETPLACE_TAGS.has(t))) return "skip";
  const tags = allTags.filter(t => !STATUS_TAGS.has(t));
  if (tags.some(t => t === "ProlinePro B2B")) return "prolinePro";
  if (tags.length === 1 && tags[0] === "[]") return "phone";
  if (tags.length === 0) return "prh";
  return "other";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const channel = searchParams.get("channel") as Channel | null;

    if (!start || !end || !channel) {
      return NextResponse.json({ error: "start, end, and channel required" }, { status: 400 });
    }

    const { orders } = await getOrdersWithRefundsInWindow(start, end);

    const matched = orders
      .filter(o => {
        const date = o.created_at.substring(0, 10);
        if (date < start || date > end) return false; // drop refund-only pulls
        return classifyOrder(o) === channel;
      })
      .map(o => {
        const subtotal = parseFloat(o.subtotal_price);
        const totalPrice = parseFloat(o.total_price);
        const tax = parseFloat(o.total_tax);
        const discounts = parseFloat(o.total_discounts ?? "0");
        const shipping = Math.max(0, totalPrice - subtotal - tax);
        const refundedAmount = (o.refunds ?? []).reduce((s, r) =>
          s + (r.refund_line_items ?? []).reduce((rs, li) => rs + parseFloat(li.subtotal ?? "0"), 0)
        , 0);
        const customer = o.customer
          ? [o.customer.first_name, o.customer.last_name].filter(Boolean).join(" ").trim() || o.customer.email || ""
          : "";
        const tags = o.tags.split(",").map(t => t.trim()).filter(Boolean);
        return {
          id: o.id,
          name: o.name,
          date: o.created_at.substring(0, 10),
          customer,
          email: o.customer?.email ?? "",
          subtotal,
          discounts,
          shipping,
          tax,
          total: totalPrice,
          refundedAmount,
          financialStatus: o.financial_status,
          tags,
        };
      })
      .sort((a, b) => b.subtotal - a.subtotal);

    return NextResponse.json({ orders: matched }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("channel-orders error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
