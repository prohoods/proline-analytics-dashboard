import { NextRequest, NextResponse } from "next/server";
import { shopifyFetch } from "@/lib/shopify";

interface RefundLineItem {
  line_item: { title: string; sku: string; price: string };
  quantity: number;
  subtotal: string;
  total_tax: string;
}

interface RefundTransaction {
  amount: string;
  kind: string;
  status: string;
}

interface Refund {
  id: number;
  created_at: string;
  note: string;
  refund_line_items: RefundLineItem[];
  transactions: RefundTransaction[];
}

interface Order {
  id: number;
  name: string;
  created_at: string;
  total_price: string;
  financial_status: string;
  customer: { first_name: string; last_name: string; email: string } | null;
  refunds: Refund[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    // Fetch refunded orders only
    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00&financial_status=refunded,partially_refunded&status=any&limit=250`;
    const data = await shopifyFetch<{ orders: Order[] }>(`orders.json?${params}`);
    const orders = data.orders;

    const refundList: {
      orderId: string;
      orderName: string;
      refundDate: string;
      orderDate: string;
      customer: string;
      items: { title: string; sku: string; quantity: number; subtotal: number }[];
      refundAmount: number;
      note: string;
    }[] = [];

    let totalRefunded = 0;
    let totalItemsRefunded = 0;

    for (const order of orders) {
      for (const refund of order.refunds) {
        // Sum transactions for refund amount
        const amount = refund.transactions
          .filter(t => t.kind === "refund" && t.status === "success")
          .reduce((s, t) => s + parseFloat(t.amount), 0);

        // Fall back to line items if no transactions
        const lineItemTotal = refund.refund_line_items.reduce(
          (s, li) => s + parseFloat(li.subtotal) + parseFloat(li.total_tax), 0
        );

        const refundAmount = amount > 0 ? amount : lineItemTotal;

        const items = refund.refund_line_items.map(li => ({
          title: li.line_item.title,
          sku: li.line_item.sku,
          quantity: li.quantity,
          subtotal: parseFloat(li.subtotal),
        }));

        totalRefunded += refundAmount;
        totalItemsRefunded += items.reduce((s, i) => s + i.quantity, 0);

        refundList.push({
          orderId: order.id.toString(),
          orderName: order.name,
          refundDate: refund.created_at.substring(0, 10),
          orderDate: order.created_at.substring(0, 10),
          customer: order.customer
            ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
            : "Guest",
          items,
          refundAmount,
          note: refund.note ?? "",
        });
      }
    }

    // Sort by refund date descending
    refundList.sort((a, b) => b.refundDate.localeCompare(a.refundDate));

    return NextResponse.json({
      refunds: refundList,
      summary: {
        totalRefunded,
        totalOrders: orders.length,
        totalItemsRefunded,
        refundCount: refundList.length,
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
