import { NextRequest, NextResponse } from "next/server";
import { getOrdersWithRefundsInWindow, resolveOrderRefunds, mapLimit } from "@/lib/shopify";

// Each refund carries its own date — we bucket refunds on the refund date,
// not the original order date. This keeps historical weeks stable (Shopify's
// own reports do the same) and makes the dashboard reconcile to Shopify.
interface DatedRefund {
  orderId: number;
  refundDate: string;   // YYYY-MM-DD (based on refund.created_at)
  amount: number;       // subtotal + tax from refund_line_items (or tx fallback)
  tax: number;          // refunded tax portion — needed for sales-tax reporting
  redo: number;         // redo line items refunded — pass-through to Redo
}

// Redo is the shipping-protection SaaS — fees ride as line items with an
// x-redo SKU. We collect at checkout and remit to Redo, so the money isn't
// ours; surface it separately and back it out of net.
function isRedoSku(sku: string | undefined | null): boolean {
  return !!sku && sku.toLowerCase().startsWith("x-redo");
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end date required" }, { status: 400 });
    }

    // Fetches orders created in window (for sales) plus orders updated in
    // window with refund activity (for cross-period refunds).
    const { orders } = await getOrdersWithRefundsInWindow(start, end);

    // Pull full refund details for any order flagged as refunded.
    const ordersWithRefunds = orders.filter(o =>
      (o.refunds && o.refunds.length > 0) ||
      o.financial_status === "refunded" ||
      o.financial_status === "partially_refunded"
    );

    const datedRefunds: DatedRefund[] = [];

    await mapLimit(ordersWithRefunds, 2, async (order) => {
      const refunds = await resolveOrderRefunds(order);
      for (const r of refunds) {
          const lineItemSubtotal = r.refund_line_items?.reduce(
            (s, li) => s + parseFloat(li.subtotal ?? "0"), 0
          ) ?? 0;
          const lineItemTax = r.refund_line_items?.reduce(
            (s, li) => s + parseFloat(li.total_tax ?? "0"), 0
          ) ?? 0;
          const redoRefund = r.refund_line_items?.reduce(
            (s, li) => s + (isRedoSku(li.line_item?.sku) ? parseFloat(li.subtotal ?? "0") : 0), 0
          ) ?? 0;
          const lineItemTotal = lineItemSubtotal + lineItemTax;
          // Fallback: if no line items, use transaction amount (no tax split available)
          const txTotal = lineItemTotal === 0
            ? r.transactions?.reduce((s, t) => s + parseFloat(t.amount ?? "0"), 0) ?? 0
            : 0;
          const amount = lineItemTotal > 0 ? lineItemTotal : txTotal;
          if (amount <= 0) continue;
          const refundDate = (r.created_at ?? order.created_at).substring(0, 10);
          // Older orders pulled in via updated_at can carry refunds from prior
          // periods — only keep refunds whose own date falls in the window.
          if (refundDate < start || refundDate > end) continue;
          datedRefunds.push({
            orderId: order.id,
            refundDate,
            amount,
            tax: lineItemTax,
            redo: redoRefund,
          });
        }
      });

    // Aggregate daily totals. Gross revenue buckets on order date; refunds
    // bucket on refund date so historical days don't mutate when a return comes in.
    const dailyMap: Record<string, {
      date: string;
      orders: number;
      grossRevenue: number;
      refunds: number;
      refundTax: number;    // sales tax refunded this day — subtract from tax liability
      netRevenue: number;   // gross on this day minus refunds on this day, ex Redo
      tax: number;          // gross tax collected this day (pre-refund)
      redo: number;         // Redo pass-through (collected − refunded, by day)
    }> = {};

    const ensureDay = (date: string) => {
      if (!dailyMap[date]) {
        dailyMap[date] = { date, orders: 0, grossRevenue: 0, refunds: 0, refundTax: 0, netRevenue: 0, tax: 0, redo: 0 };
      }
      return dailyMap[date];
    };

    let totalGross = 0;
    let totalRefunds = 0;
    let totalRefundTax = 0;
    let totalTax = 0;
    let totalOrders = 0;
    let totalRedo = 0;

    for (const order of orders) {
      const date = order.created_at.substring(0, 10);
      // Drop orders created outside the window — they're only here because
      // their refund activity happened inside the window.
      if (date < start || date > end) continue;
      const day = ensureDay(date);
      const gross = parseFloat(order.total_price);
      const tax = parseFloat(order.total_tax);
      const redoCollected = (order.line_items ?? []).reduce(
        (s, li) => s + (isRedoSku(li.sku) ? parseFloat(li.price ?? "0") * (li.quantity ?? 1) : 0), 0
      );

      day.orders += 1;
      day.grossRevenue += gross;
      day.tax += tax;
      day.redo += redoCollected;
      day.netRevenue += gross - redoCollected; // refunds subtracted below on refund date

      totalGross += gross;
      totalTax += tax;
      totalRedo += redoCollected;
      totalOrders += 1;
    }

    for (const r of datedRefunds) {
      const day = ensureDay(r.refundDate);
      day.refunds += r.amount;
      day.refundTax += r.tax;
      day.redo -= r.redo;
      // Net drops by the refund but Redo-portion of that refund isn't ours
      // to lose (we never kept it); add it back so net reflects Proline only.
      day.netRevenue -= (r.amount - r.redo);
      totalRefunds += r.amount;
      totalRefundTax += r.tax;
      totalRedo -= r.redo;
    }

    const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      daily,
      summary: {
        totalOrders,
        grossRevenue: totalGross,
        totalRefunds,
        netRevenue: totalGross - totalRefunds - totalRedo,
        grossTax: totalTax,
        refundTax: totalRefundTax,
        netTax: totalTax - totalRefundTax,
        redo: totalRedo,
        dateRange: { start, end },
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("shopify orders error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
