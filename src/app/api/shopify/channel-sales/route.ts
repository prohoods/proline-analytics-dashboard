import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrderRefunds, ShopifyOrder } from "@/lib/shopify";

type Channel = "prh" | "prolinePro" | "phone" | "other";

function classifyOrder(order: ShopifyOrder): Channel {
  const tags = order.tags.trim();
  if (tags === "[]") return "phone";
  if (tags === "") return "prh";
  if (tags.includes("ProlinePro B2B")) return "prolinePro";
  return "other"; // unknown / future SHL
}

interface DayBucket {
  date: string;
  prh: number;
  prolinePro: number;
  phone: number;
  other: number;
  refunds: number;
  salesTax: number;
  gross: number;
  net: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00`;
    const { orders } = await getOrders(params);

    // Fetch real refund amounts
    const refundMap: Record<number, number> = {};
    const ordersWithRefunds = orders.filter(o =>
      (o.refunds && o.refunds.length > 0) ||
      o.financial_status === "refunded" ||
      o.financial_status === "partially_refunded"
    );

    await Promise.all(
      ordersWithRefunds.map(async (order) => {
        const refunds = await getOrderRefunds(order.id);
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
    const dailyMap: Record<string, DayBucket> = {};

    for (const order of orders) {
      const date = order.created_at.substring(0, 10);
      if (!dailyMap[date]) {
        dailyMap[date] = { date, prh: 0, prolinePro: 0, phone: 0, other: 0, refunds: 0, salesTax: 0, gross: 0, net: 0 };
      }

      // subtotal_price = product revenue after discounts, before tax & shipping
      const subtotal = parseFloat(order.subtotal_price);
      const tax = parseFloat(order.total_tax);
      const refundAmount = refundMap[order.id] ?? 0;
      const channel = classifyOrder(order);

      dailyMap[date][channel] += subtotal;
      dailyMap[date].salesTax += tax;
      dailyMap[date].refunds += refundAmount;
      dailyMap[date].gross += subtotal;
    }

    const daily: DayBucket[] = Object.values(dailyMap)
      .map(d => ({ ...d, net: d.gross - d.refunds }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Roll up to monthly
    const monthMap: Record<string, DayBucket> = {};
    for (const day of daily) {
      const ym = day.date.substring(0, 7);
      if (!monthMap[ym]) {
        monthMap[ym] = { date: ym, prh: 0, prolinePro: 0, phone: 0, other: 0, refunds: 0, salesTax: 0, gross: 0, net: 0 };
      }
      monthMap[ym].prh += day.prh;
      monthMap[ym].prolinePro += day.prolinePro;
      monthMap[ym].phone += day.phone;
      monthMap[ym].other += day.other;
      monthMap[ym].refunds += day.refunds;
      monthMap[ym].salesTax += day.salesTax;
      monthMap[ym].gross += day.gross;
      monthMap[ym].net += day.net;
    }

    const monthly = Object.values(monthMap).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ daily, monthly }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("channel-sales error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
