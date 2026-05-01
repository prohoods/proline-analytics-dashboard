import { NextRequest, NextResponse } from "next/server";
import { getSHLOrders, resolveSHLOrderRefunds } from "@/lib/shl-shopify";
import { mapLimit } from "@/lib/shopify";

// See DTC /api/shopify/orders for rationale — refunds bucket on refund date,
// not order date, so historical weeks don't mutate.
interface DatedRefund {
  orderId: number;
  refundDate: string;
  amount: number;
  tax: number;
}

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

    const ordersWithRefunds = orders.filter(o =>
      (o.refunds && o.refunds.length > 0) ||
      o.financial_status === "refunded" ||
      o.financial_status === "partially_refunded"
    );

    const datedRefunds: DatedRefund[] = [];

    await mapLimit(ordersWithRefunds, 2, async (order) => {
        const refunds = await resolveSHLOrderRefunds(order);
        for (const r of refunds) {
          const lineItemSubtotal = r.refund_line_items?.reduce(
            (s, li) => s + parseFloat(li.subtotal ?? "0"), 0
          ) ?? 0;
          const lineItemTax = r.refund_line_items?.reduce(
            (s, li) => s + parseFloat(li.total_tax ?? "0"), 0
          ) ?? 0;
          const lineItemTotal = lineItemSubtotal + lineItemTax;
          const txTotal = lineItemTotal === 0
            ? r.transactions?.reduce((s, t) => s + parseFloat(t.amount ?? "0"), 0) ?? 0
            : 0;
          const amount = lineItemTotal > 0 ? lineItemTotal : txTotal;
          if (amount <= 0) continue;
          datedRefunds.push({
            orderId: order.id,
            refundDate: (r.created_at ?? order.created_at).substring(0, 10),
            amount,
            tax: lineItemTax,
          });
        }
      });

    // Same per-day shape as Proline channel-sales so the dashboard can fold
    // SHL into business-wide Gross/Discounts/Refunds/Net columns. Gross is
    // line-items-before-discounts (subtotal + total_discounts), matching how
    // Proline's gross is computed; netRevenue = gross − discounts − refunds.
    const dailyMap: Record<string, {
      date: string;
      orders: number;
      grossRevenue: number;
      discounts: number;
      refunds: number;
      refundTax: number;
      netRevenue: number;
      shipping: number;
      tax: number;
    }> = {};

    const ensureDay = (date: string) => {
      if (!dailyMap[date]) {
        dailyMap[date] = { date, orders: 0, grossRevenue: 0, discounts: 0, refunds: 0, refundTax: 0, netRevenue: 0, shipping: 0, tax: 0 };
      }
      return dailyMap[date];
    };

    let totalGross = 0;
    let totalDiscounts = 0;
    let totalRefunds = 0;
    let totalRefundTax = 0;
    let totalShipping = 0;
    let totalTax = 0;
    let totalOrders = 0;

    for (const order of orders) {
      const date = order.created_at.substring(0, 10);
      const day = ensureDay(date);
      const subtotal = parseFloat(order.subtotal_price);
      const totalPrice = parseFloat(order.total_price);
      const tax = parseFloat(order.total_tax);
      const discounts = parseFloat(order.total_discounts ?? "0");
      const shipping = Math.max(0, totalPrice - subtotal - tax);
      const gross = subtotal + discounts;

      day.orders += 1;
      day.grossRevenue += gross;
      day.discounts += discounts;
      day.shipping += shipping;
      day.tax += tax;
      day.netRevenue += gross - discounts; // refunds applied below on refund date

      totalGross += gross;
      totalDiscounts += discounts;
      totalShipping += shipping;
      totalTax += tax;
      totalOrders += 1;
    }

    for (const r of datedRefunds) {
      const day = ensureDay(r.refundDate);
      // Refund subtotal only (tax handled in refundTax/Tax column).
      const subtotal = Math.max(0, r.amount - r.tax);
      day.refunds += subtotal;
      day.refundTax += r.tax;
      day.netRevenue -= subtotal;
      totalRefunds += subtotal;
      totalRefundTax += r.tax;
    }

    const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      daily,
      summary: {
        totalOrders,
        grossRevenue: totalGross,
        discounts: totalDiscounts,
        totalRefunds,
        netRevenue: totalGross - totalDiscounts - totalRefunds,
        shipping: totalShipping,
        grossTax: totalTax,
        refundTax: totalRefundTax,
        netTax: totalTax - totalRefundTax,
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
