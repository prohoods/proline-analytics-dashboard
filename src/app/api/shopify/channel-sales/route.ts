import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrderRefunds, mapLimit, ShopifyOrder } from "@/lib/shopify";

type Channel = "prh" | "prolinePro" | "phone" | "other";

function classifyOrder(order: ShopifyOrder): Channel {
  const tags = order.tags.trim();
  if (tags === "[]") return "phone";
  if (tags === "") return "prh";
  if (tags.includes("ProlinePro B2B")) return "prolinePro";
  return "other";
}

// ISO week key: YYYY-Www (e.g. "2026-W15")
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const dayDiff = Math.floor((d.getTime() - startOfWeek1.getTime()) / 86400000);
  const weekNum = Math.floor(dayDiff / 7) + 1;
  const year = weekNum === 0 ? d.getFullYear() - 1 : d.getFullYear();
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

// First Monday of the ISO week, used as a display label
function weekStartDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dayOfWeek = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - dayOfWeek);
  return monday.toISOString().substring(0, 10);
}

export interface SalesBucket {
  date: string;          // YYYY-MM-DD / YYYY-MM / YYYY-Www
  weekStart?: string;    // weekly only: Monday date for display
  prh: number;
  prolinePro: number;
  phone: number;
  other: number;
  grossSales: number;    // subtotal + discounts (before discounts)
  discounts: number;     // total_discounts (positive number)
  returns: number;       // refund amounts
  netSales: number;      // grossSales - discounts - returns
  shipping: number;      // total_price - subtotal - tax
  salesTax: number;
  totalSales: number;    // netSales + shipping + salesTax
}

function emptyBucket(date: string): SalesBucket {
  return { date, prh: 0, prolinePro: 0, phone: 0, other: 0, grossSales: 0, discounts: 0, returns: 0, netSales: 0, shipping: 0, salesTax: 0, totalSales: 0 };
}

function rollup(buckets: SalesBucket[], key: string): SalesBucket {
  const b = emptyBucket(key);
  for (const d of buckets) {
    b.prh += d.prh; b.prolinePro += d.prolinePro; b.phone += d.phone; b.other += d.other;
    b.grossSales += d.grossSales; b.discounts += d.discounts; b.returns += d.returns;
    b.netSales += d.netSales; b.shipping += d.shipping; b.salesTax += d.salesTax; b.totalSales += d.totalSales;
  }
  return b;
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

    // Fetch refunds and bucket by the refund's own created_at date
    // (matches Shopify Analytics which attributes returns to when the refund was processed).
    // Split subtotal and tax — Shopify's Total sales breakdown shows Returns as
    // subtotal-only and subtracts refunded tax from the Taxes line instead.
    const returnsByDate: Record<string, number> = {};
    const refundTaxByDate: Record<string, number> = {};
    const ordersWithRefunds = orders.filter(o =>
      (o.refunds && o.refunds.length > 0) ||
      o.financial_status === "refunded" ||
      o.financial_status === "partially_refunded"
    );

    await mapLimit(ordersWithRefunds, 2, async (order) => {
        const refunds = await getOrderRefunds(order.id);
        for (const r of refunds) {
          const refundDate = r.created_at.substring(0, 10);
          // Only attribute to dates within the requested range
          if (refundDate < start || refundDate > end) continue;
          const lineItemSubtotal = r.refund_line_items?.reduce(
            (s, li) => s + parseFloat(li.subtotal ?? "0"), 0
          ) ?? 0;
          const lineItemTax = r.refund_line_items?.reduce(
            (s, li) => s + parseFloat(li.total_tax ?? "0"), 0
          ) ?? 0;
          // Fallback when line items are absent: use transaction total (no tax split).
          const txTotal = lineItemSubtotal === 0 && lineItemTax === 0
            ? r.transactions?.reduce((s, t) => s + parseFloat(t.amount ?? "0"), 0) ?? 0
            : 0;
          const subtotalAmt = lineItemSubtotal > 0 ? lineItemSubtotal : txTotal;
          if (subtotalAmt <= 0 && lineItemTax <= 0) continue;
          returnsByDate[refundDate] = (returnsByDate[refundDate] ?? 0) + subtotalAmt;
          refundTaxByDate[refundDate] = (refundTaxByDate[refundDate] ?? 0) + lineItemTax;
        }
      });

    // Aggregate by day
    const dailyMap: Record<string, SalesBucket> = {};

    for (const order of orders) {
      const date = order.created_at.substring(0, 10);
      if (!dailyMap[date]) dailyMap[date] = emptyBucket(date);

      const subtotal   = parseFloat(order.subtotal_price);
      const totalPrice = parseFloat(order.total_price);
      const tax        = parseFloat(order.total_tax);
      const discounts  = parseFloat(order.total_discounts ?? "0");
      const shipping   = Math.max(0, totalPrice - subtotal - tax);
      const channel    = classifyOrder(order);

      // Gross = subtotal + discounts (line items before discount)
      const gross = subtotal + discounts;
      const net   = gross - discounts; // returns applied separately below

      dailyMap[date][channel]      += subtotal; // channel columns show post-discount subtotal
      dailyMap[date].grossSales    += gross;
      dailyMap[date].discounts     += discounts;
      dailyMap[date].netSales      += net;
      dailyMap[date].shipping      += shipping;
      dailyMap[date].salesTax      += tax;
      dailyMap[date].totalSales    += net + shipping + tax;
    }

    // Apply returns to the date the refund was actually processed.
    // Returns = refunded subtotal. Refunded tax is subtracted from salesTax
    // so the Taxes column matches Shopify's net-tax Total sales breakdown.
    const refundDates = new Set([...Object.keys(returnsByDate), ...Object.keys(refundTaxByDate)]);
    for (const date of refundDates) {
      if (!dailyMap[date]) dailyMap[date] = emptyBucket(date);
      const subAmt = returnsByDate[date] ?? 0;
      const taxAmt = refundTaxByDate[date] ?? 0;
      dailyMap[date].returns    += subAmt;
      dailyMap[date].netSales   -= subAmt;
      dailyMap[date].salesTax   -= taxAmt;
      dailyMap[date].totalSales -= (subAmt + taxAmt);
    }

    const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    // Weekly rollup
    const weekMap: Record<string, SalesBucket[]> = {};
    for (const d of daily) {
      const wk = isoWeek(d.date);
      if (!weekMap[wk]) weekMap[wk] = [];
      weekMap[wk].push(d);
    }
    const weekly = Object.entries(weekMap)
      .map(([wk, days]) => ({
        ...rollup(days, wk),
        weekStart: weekStartDate(days[days.length - 1].date), // earliest day in bucket
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Monthly rollup
    const monthMap: Record<string, SalesBucket[]> = {};
    for (const d of daily) {
      const ym = d.date.substring(0, 7);
      if (!monthMap[ym]) monthMap[ym] = [];
      monthMap[ym].push(d);
    }
    const monthly = Object.entries(monthMap)
      .map(([ym, days]) => rollup(days, ym))
      .sort((a, b) => b.date.localeCompare(a.date));

    const today = new Date().toISOString().substring(0, 10);
    const includesLive = end >= today;
    const ttl = includesLive ? 60 : 900;

    return NextResponse.json({ daily, weekly, monthly }, {
      headers: { "Cache-Control": `public, s-maxage=${ttl}, stale-while-revalidate=30` },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("channel-sales error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
