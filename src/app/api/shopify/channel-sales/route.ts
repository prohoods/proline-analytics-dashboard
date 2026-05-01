import { NextRequest, NextResponse } from "next/server";
import { getOrdersWithRefundsInWindow, resolveOrderRefunds, mapLimit, ShopifyOrder } from "@/lib/shopify";

type Channel = "prh" | "prolinePro" | "phone" | "other" | "skip";

// Status tags that get added AFTER an order is placed — they describe what
// happened to the order, not how the sale came in. If we don't strip them
// before classifying, a refunded PRH order ends up in "Other" instead of PRH,
// which inflates Other and undercounts every real channel.
const STATUS_TAGS = new Set(["REFUNDED", "redo_claim"]);

// Tags that mark Amazon/Wayfair/HomeDepot orders synced into Shopify for
// inventory. The actual revenue lives on the marketplace platform and is
// tracked separately via the Marketplaces sheet — counting these in Shopify
// channels would either show $0 (current behavior, polluting Other) or
// double-count if Shopify ever fills in the totals.
const MARKETPLACE_TAGS = new Set(["Market Place Order", "Marketplace"]);

function classifyOrder(order: ShopifyOrder): Channel {
  const allTags = order.tags.split(",").map(t => t.trim()).filter(Boolean);

  // Marketplace-synced orders are tracked via the Sheets-fed Mktplc column.
  if (allTags.some(t => MARKETPLACE_TAGS.has(t))) return "skip";

  // Drop status tags so they can't override the channel signal.
  const tags = allTags.filter(t => !STATUS_TAGS.has(t));

  // ProlinePro wins over phone — call-in orders from a B2B account carry
  // both "[]" and "ProlinePro B2B"; we want them counted as PRO once.
  if (tags.some(t => t === "ProlinePro B2B")) return "prolinePro";
  if (tags.length === 1 && tags[0] === "[]") return "phone";
  if (tags.length === 0) return "prh";
  return "other";
}

// Redo is the shipping protection / returns SaaS. We collect the fee at
// checkout but remit it to Redo — it's not Proline revenue. Exposed in its
// own column and subtracted from Net / Total so the dashboard reflects the
// cash Proline actually keeps.
function isRedoSku(sku: string | undefined | null): boolean {
  return !!sku && sku.toLowerCase().startsWith("x-redo");
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
  netSales: number;      // grossSales - discounts - returns - redo
  shipping: number;      // total_price - subtotal - tax
  salesTax: number;
  redo: number;          // pass-through to Redo (collected − refunded)
  totalSales: number;    // netSales + shipping + salesTax
}

function emptyBucket(date: string): SalesBucket {
  return { date, prh: 0, prolinePro: 0, phone: 0, other: 0, grossSales: 0, discounts: 0, returns: 0, netSales: 0, shipping: 0, salesTax: 0, redo: 0, totalSales: 0 };
}

function rollup(buckets: SalesBucket[], key: string): SalesBucket {
  const b = emptyBucket(key);
  for (const d of buckets) {
    b.prh += d.prh; b.prolinePro += d.prolinePro; b.phone += d.phone; b.other += d.other;
    b.grossSales += d.grossSales; b.discounts += d.discounts; b.returns += d.returns;
    b.netSales += d.netSales; b.shipping += d.shipping; b.salesTax += d.salesTax;
    b.redo += d.redo; b.totalSales += d.totalSales;
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

    // Pulls orders created in the window (for sales) PLUS orders updated in
    // the window with refund activity (for refunds processed in the window
    // on older orders). Caller filters appropriately below.
    const { orders } = await getOrdersWithRefundsInWindow(start, end);

    // Fetch refunds and bucket by the refund's own created_at date
    // (matches Shopify Analytics which attributes returns to when the refund was processed).
    // Split subtotal and tax — Shopify's Total sales breakdown shows Returns as
    // subtotal-only and subtracts refunded tax from the Taxes line instead.
    const returnsByDate: Record<string, number> = {};
    const refundTaxByDate: Record<string, number> = {};
    const redoRefundedByDate: Record<string, number> = {};
    const ordersWithRefunds = orders.filter(o =>
      (o.refunds && o.refunds.length > 0) ||
      o.financial_status === "refunded" ||
      o.financial_status === "partially_refunded"
    );

    await mapLimit(ordersWithRefunds, 2, async (order) => {
        const refunds = await resolveOrderRefunds(order);
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
          const redoRefund = r.refund_line_items?.reduce(
            (s, li) => s + (isRedoSku(li.line_item?.sku) ? parseFloat(li.subtotal ?? "0") : 0), 0
          ) ?? 0;
          // Fallback when line items are absent: use transaction total (no tax split).
          const txTotal = lineItemSubtotal === 0 && lineItemTax === 0
            ? r.transactions?.reduce((s, t) => s + parseFloat(t.amount ?? "0"), 0) ?? 0
            : 0;
          const subtotalAmt = lineItemSubtotal > 0 ? lineItemSubtotal : txTotal;
          if (subtotalAmt <= 0 && lineItemTax <= 0) continue;
          returnsByDate[refundDate] = (returnsByDate[refundDate] ?? 0) + subtotalAmt;
          refundTaxByDate[refundDate] = (refundTaxByDate[refundDate] ?? 0) + lineItemTax;
          if (redoRefund > 0) {
            redoRefundedByDate[refundDate] = (redoRefundedByDate[refundDate] ?? 0) + redoRefund;
          }
        }
      });

    // Aggregate by day
    const dailyMap: Record<string, SalesBucket> = {};

    // Track unique tags that landed in "Other" so we can show the user what's
    // there. They were calling it a black box; this lets them tune the rules.
    const otherTagSamples: Map<string, { count: number; amount: number; sample: string }> = new Map();

    for (const order of orders) {
      const date = order.created_at.substring(0, 10);
      // Skip orders created outside the window — those only made it into the
      // result set because they had refund activity in the window. Counting
      // their sales would inflate Gross.
      if (date < start || date > end) continue;
      if (!dailyMap[date]) dailyMap[date] = emptyBucket(date);

      const channel = classifyOrder(order);
      // Marketplace-synced orders are tracked via the Sheets pipeline; skip
      // them entirely so they don't show up under Gross/Discounts/Net here.
      if (channel === "skip") continue;

      const subtotal   = parseFloat(order.subtotal_price);
      const totalPrice = parseFloat(order.total_price);
      const tax        = parseFloat(order.total_tax);
      const discounts  = parseFloat(order.total_discounts ?? "0");
      const shipping   = Math.max(0, totalPrice - subtotal - tax);

      if (channel === "other") {
        const tagKey = order.tags.trim() || "(empty)";
        const cur = otherTagSamples.get(tagKey) ?? { count: 0, amount: 0, sample: order.name };
        cur.count += 1;
        cur.amount += subtotal;
        otherTagSamples.set(tagKey, cur);
      }

      // Redo fee rides as a line item — split it out so we can show the
      // pass-through separately and back it out of Net/Total.
      const redoCollected = (order.line_items ?? []).reduce(
        (s, li) => s + (isRedoSku(li.sku) ? parseFloat(li.price ?? "0") * (li.quantity ?? 1) : 0), 0
      );

      // Gross = subtotal + discounts (line items before discount)
      const gross = subtotal + discounts;
      const net   = gross - discounts - redoCollected; // returns applied below

      dailyMap[date][channel]      += subtotal; // channel columns show post-discount subtotal
      dailyMap[date].grossSales    += gross;
      dailyMap[date].discounts     += discounts;
      dailyMap[date].netSales      += net;
      dailyMap[date].shipping      += shipping;
      dailyMap[date].salesTax      += tax;
      dailyMap[date].redo          += redoCollected;
      dailyMap[date].totalSales    += net + shipping + tax;
    }

    // Apply returns to the date the refund was actually processed.
    // Returns = refunded subtotal. Refunded tax is subtracted from salesTax
    // so the Taxes column matches Shopify's net-tax Total sales breakdown.
    // Redo portion of refunds is backed out of the Redo column (and added back
    // to netSales, since we already subtracted it from returns implicitly).
    const refundDates = new Set([
      ...Object.keys(returnsByDate),
      ...Object.keys(refundTaxByDate),
      ...Object.keys(redoRefundedByDate),
    ]);
    for (const date of refundDates) {
      if (!dailyMap[date]) dailyMap[date] = emptyBucket(date);
      const subAmt = returnsByDate[date] ?? 0;
      const taxAmt = refundTaxByDate[date] ?? 0;
      const redoAmt = redoRefundedByDate[date] ?? 0;
      dailyMap[date].returns    += subAmt;
      dailyMap[date].netSales   -= (subAmt - redoAmt);
      dailyMap[date].salesTax   -= taxAmt;
      dailyMap[date].redo       -= redoAmt;
      dailyMap[date].totalSales -= (subAmt - redoAmt + taxAmt);
    }

    // Ascending: oldest → newest, so the table reads Jan → April top-to-bottom.
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

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
        weekStart: weekStartDate(days[0].date), // any day in the bucket resolves to Monday
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Monthly rollup
    const monthMap: Record<string, SalesBucket[]> = {};
    for (const d of daily) {
      const ym = d.date.substring(0, 7);
      if (!monthMap[ym]) monthMap[ym] = [];
      monthMap[ym].push(d);
    }
    const monthly = Object.entries(monthMap)
      .map(([ym, days]) => rollup(days, ym))
      .sort((a, b) => a.date.localeCompare(b.date));

    const today = new Date().toISOString().substring(0, 10);
    const includesLive = end >= today;
    const ttl = includesLive ? 60 : 900;

    const otherBreakdown = Array.from(otherTagSamples.entries())
      .map(([tags, v]) => ({ tags, count: v.count, amount: v.amount, sampleOrder: v.sample }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20);

    return NextResponse.json({ daily, weekly, monthly, otherBreakdown }, {
      headers: { "Cache-Control": `public, s-maxage=${ttl}, stale-while-revalidate=30` },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("channel-sales error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
