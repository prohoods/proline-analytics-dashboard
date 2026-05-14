import { NextRequest, NextResponse } from "next/server";
import { getOrdersWithRefundsInWindow } from "@/lib/shopify";
import { getCOGS } from "@/lib/cogs";
import { TARIFF_RATE } from "@/lib/constants";

// Ranges sales aggregation. Filters Shopify line items down to SKUs starting
// with PLSR or PLST (excluding the 2pc- bundle prefix, which is tracked
// separately on the bundles page).

const RANGE_PREFIXES = ["PLSR", "PLST"];

function isRangeSku(sku: string): boolean {
  if (!sku) return false;
  if (sku.toLowerCase().startsWith("2pc-")) return false;
  const upper = sku.toUpperCase();
  return RANGE_PREFIXES.some((p) => upper.startsWith(p));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    const { orders } = await getOrdersWithRefundsInWindow(start, end);

    const skuMap: Record<string, {
      title: string;
      sku: string;
      orderNames: Set<string>;
      unitsSold: number;
      grossRevenue: number;
      refundedUnits: number;
      refundedRevenue: number;
      firstSold: string | null;
      lastSold: string | null;
    }> = {};

    interface SaleRow {
      date: string;
      orderName: string;
      sku: string;
      title: string;
      quantity: number;
      unitPrice: number;
      lineRevenue: number;
      customer: string;
      state: string;
      channel: string; // dtc / b2b / phone (from order tags) → source_name fallback
    }
    const salesDetail: SaleRow[] = [];

    // Draft orders (orders created manually in the Shopify admin that haven't
    // converted to a real sale, or were created for quoting only) shouldn't
    // count toward product analytics.
    function isDraftOrder(order: typeof orders[number]): boolean {
      return order.source_name === "shopify_draft_order";
    }

    function orderChannel(order: typeof orders[number]): string {
      const tags = (order.tags ?? "").toLowerCase();
      if (tags.includes("prolinepro b2b")) return "b2b";
      if (tags.includes("[]")) return "phone";
      return order.source_name === "web" || !order.source_name ? "dtc" : order.source_name;
    }

    // Weekly aggregation. Week is keyed by Monday-of-week (YYYY-MM-DD).
    function weekStart(isoDate: string): string {
      const d = new Date(isoDate + "T00:00:00Z");
      const day = d.getUTCDay(); // 0=Sun..6=Sat
      const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
      d.setUTCDate(d.getUTCDate() + diff);
      return d.toISOString().substring(0, 10);
    }

    const weekly: Record<string, {
      weekStart: string;
      orderNames: Set<string>;
      units: number;
      revenue: number;
      perSku: Map<string, number>; // sku → units
    }> = {};

    const orderInWindow = (order: typeof orders[number]) => {
      const d = order.created_at.substring(0, 10);
      return d >= start && d <= end;
    };

    for (const order of orders) {
      if (isDraftOrder(order)) continue; // skip draft orders entirely
      if (orderInWindow(order)) {
        const orderDate = order.created_at.substring(0, 10);
        const wk = weekStart(orderDate);
        const customerName = order.customer
          ? `${order.customer.first_name ?? ""} ${order.customer.last_name ?? ""}`.trim() || (order.customer.email ?? "")
          : "";
        const state = order.shipping_address?.province_code ?? "";
        const channel = orderChannel(order);

        for (const item of order.line_items) {
          if (!isRangeSku(item.sku)) continue;
          const key = item.sku;
          if (!skuMap[key]) {
            skuMap[key] = {
              title: item.title + (item.variant_title ? ` — ${item.variant_title}` : ""),
              sku: item.sku,
              orderNames: new Set(),
              unitsSold: 0,
              grossRevenue: 0,
              refundedUnits: 0,
              refundedRevenue: 0,
              firstSold: null,
              lastSold: null,
            };
          }
          skuMap[key].orderNames.add(order.name);
          skuMap[key].unitsSold += item.quantity;
          const unitPrice = parseFloat(item.price);
          const lineRevenue = unitPrice * item.quantity;
          skuMap[key].grossRevenue += lineRevenue;
          if (!skuMap[key].firstSold || orderDate < skuMap[key].firstSold!) skuMap[key].firstSold = orderDate;
          if (!skuMap[key].lastSold || orderDate > skuMap[key].lastSold!) skuMap[key].lastSold = orderDate;

          if (!weekly[wk]) {
            weekly[wk] = { weekStart: wk, orderNames: new Set(), units: 0, revenue: 0, perSku: new Map() };
          }
          weekly[wk].orderNames.add(order.name);
          weekly[wk].units += item.quantity;
          weekly[wk].revenue += lineRevenue;
          weekly[wk].perSku.set(item.sku, (weekly[wk].perSku.get(item.sku) ?? 0) + item.quantity);

          salesDetail.push({
            date: orderDate,
            orderName: order.name,
            sku: item.sku,
            title: skuMap[key].title,
            quantity: item.quantity,
            unitPrice,
            lineRevenue,
            customer: customerName,
            state,
            channel,
          });
        }
      }

      for (const refund of order.refunds ?? []) {
        const refundDate = (refund.created_at ?? order.created_at).substring(0, 10);
        if (refundDate < start || refundDate > end) continue;
        for (const ri of refund.refund_line_items ?? []) {
          const sku = ri.line_item?.sku ?? "";
          if (!isRangeSku(sku)) continue;
          if (!skuMap[sku]) {
            skuMap[sku] = {
              title: sku,
              sku,
              orderNames: new Set(),
              unitsSold: 0,
              grossRevenue: 0,
              refundedUnits: 0,
              refundedRevenue: 0,
              firstSold: null,
              lastSold: null,
            };
          }
          skuMap[sku].refundedUnits += ri.quantity;
          skuMap[sku].refundedRevenue += parseFloat(ri.subtotal ?? "0");
        }
      }
    }

    const products = Object.values(skuMap).map((p) => {
      const netRevenue = p.grossRevenue - p.refundedRevenue;
      const netUnits = p.unitsSold - p.refundedUnits;
      const baseCostPerUnit = getCOGS(p.sku);
      const tariffPerUnit = baseCostPerUnit != null ? baseCostPerUnit * TARIFF_RATE : null;
      const landedCostPerUnit = baseCostPerUnit != null ? baseCostPerUnit + (tariffPerUnit ?? 0) : null;
      const billableUnits = Math.max(0, netUnits);
      const totalCOGS = landedCostPerUnit != null ? landedCostPerUnit * billableUnits : null;
      const grossProfit = totalCOGS != null ? netRevenue - totalCOGS : null;
      const grossMarginPct = grossProfit != null && netRevenue > 0 ? (grossProfit / netRevenue) * 100 : null;
      return {
        title: p.title,
        sku: p.sku,
        orderCount: p.orderNames.size,
        unitsSold: p.unitsSold,
        netUnits,
        grossRevenue: p.grossRevenue,
        refundedUnits: p.refundedUnits,
        refundedRevenue: p.refundedRevenue,
        netRevenue,
        refundRate: p.unitsSold > 0 ? (p.refundedUnits / p.unitsSold) * 100 : 0,
        avgPrice: p.unitsSold > 0 ? p.grossRevenue / p.unitsSold : 0,
        costPerUnit: baseCostPerUnit,
        landedCostPerUnit,
        totalCOGS,
        grossProfit,
        grossMarginPct,
        firstSold: p.firstSold,
        lastSold: p.lastSold,
      };
    }).sort((a, b) => b.grossRevenue - a.grossRevenue);

    salesDetail.sort((a, b) => b.date.localeCompare(a.date) || b.orderName.localeCompare(a.orderName));

    const weeklyRows = Object.values(weekly)
      .map((w) => ({
        weekStart: w.weekStart,
        orderCount: w.orderNames.size,
        units: w.units,
        revenue: w.revenue,
        topSkus: Array.from(w.perSku.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([sku, units]) => ({ sku, units })),
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    const summary = {
      productCount: products.length,
      unitsSold: products.reduce((s, p) => s + p.unitsSold, 0),
      netUnits: products.reduce((s, p) => s + p.netUnits, 0),
      grossRevenue: products.reduce((s, p) => s + p.grossRevenue, 0),
      refundedRevenue: products.reduce((s, p) => s + p.refundedRevenue, 0),
      netRevenue: products.reduce((s, p) => s + p.netRevenue, 0),
      totalCOGS: products.reduce((s, p) => s + (p.totalCOGS ?? 0), 0),
      grossProfit: products.reduce((s, p) => s + (p.grossProfit ?? 0), 0),
      coveredProducts: products.filter((p) => p.costPerUnit != null).length,
      tariffRate: TARIFF_RATE,
    };

    return NextResponse.json({ products, summary, sales: salesDetail, weekly: weeklyRows }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
