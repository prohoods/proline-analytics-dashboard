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
    }> = {};

    const orderInWindow = (order: typeof orders[number]) => {
      const d = order.created_at.substring(0, 10);
      return d >= start && d <= end;
    };

    for (const order of orders) {
      if (orderInWindow(order)) {
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
            };
          }
          skuMap[key].orderNames.add(order.name);
          skuMap[key].unitsSold += item.quantity;
          skuMap[key].grossRevenue += parseFloat(item.price) * item.quantity;
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
      };
    }).sort((a, b) => b.grossRevenue - a.grossRevenue);

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

    return NextResponse.json({ products, summary }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
