import { NextRequest, NextResponse } from "next/server";
import { getOrdersWithRefundsInWindow } from "@/lib/shopify";
import { getCOGS } from "@/lib/cogs";
import { TARIFF_RATE } from "@/lib/constants";
import { getShippingByOrder } from "@/lib/db";
import { classifyOrder, classifyProductWithReason, CATEGORY_LIST, type ProductCategory } from "@/lib/categories";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    const { orders } = await getOrdersWithRefundsInWindow(start, end);

    // Page-level ZIP3 aggregation: every shipped order's full shipping cost
    // attributed to its destination ZIP3, plus zip3 → state for display.
    const globalZoneAgg = new Map<string, { totalCost: number; shipments: number; state: string }>();

    // State-level aggregation, with per-category breakdown. Each shipped
    // order is classified by its biggest item (Range Hood > Insert > Parts)
    // and the full order shipping cost is attributed to that category.
    type StateAgg = {
      shipments: number;
      totalCost: number;
      byCategory: Map<ProductCategory, { shipments: number; totalCost: number }>;
    };
    const stateAgg = new Map<string, StateAgg>();

    interface RefundIncident {
      orderName: string;
      date: string;
      quantity: number;
      amount: number;
      note: string;
    }

    const skuMap: Record<string, {
      title: string;
      sku: string;
      unitsSold: number;
      grossRevenue: number;
      refundedUnits: number;
      refundedRevenue: number;
      shippingCost: number;
      shippedUnits: number;
      // Per-SKU zone aggregation: zip3 → { totalCost, shipments }
      zoneAgg: Map<string, { totalCost: number; shipments: number }>;
      refundIncidents: RefundIncident[];
    }> = {};

    // Pull shipping costs for every order in the window in one query.
    const ordersInWindow = orders.filter(o => {
      const d = o.created_at.substring(0, 10);
      return d >= start && d <= end;
    });
    const shippingByOrder = await getShippingByOrder(
      ordersInWindow.map(o => o.name)
    );

    const orderInWindow = (order: typeof orders[number]) => {
      const d = order.created_at.substring(0, 10);
      return d >= start && d <= end;
    };

    for (const order of orders) {
      // Sales aggregation: only count orders created in the window. Cross-window
      // orders only made it into the result set because of refund activity.
      if (orderInWindow(order)) {
        // Allocate this order's shipping cost across its SKUs proportional to
        // quantity. SKUs in orders without a shipping record contribute 0.
        const orderShipping = shippingByOrder.get(order.name) ?? 0;
        const totalQty = order.line_items.reduce((s, it) => s + it.quantity, 0) || 1;
        const zip3 = (order.shipping_address?.zip ?? "").substring(0, 3);
        const state = order.shipping_address?.province_code ?? "";

        if (orderShipping > 0 && zip3.length === 3) {
          const g = globalZoneAgg.get(zip3) ?? { totalCost: 0, shipments: 0, state };
          g.totalCost += orderShipping;
          g.shipments += 1;
          if (!g.state && state) g.state = state;
          globalZoneAgg.set(zip3, g);
        }

        if (orderShipping > 0 && state) {
          const category = classifyOrder(order.line_items.map(li => ({ sku: li.sku, title: li.title })));
          const sa = stateAgg.get(state) ?? { shipments: 0, totalCost: 0, byCategory: new Map() };
          sa.shipments += 1;
          sa.totalCost += orderShipping;
          const bc = sa.byCategory.get(category) ?? { shipments: 0, totalCost: 0 };
          bc.shipments += 1;
          bc.totalCost += orderShipping;
          sa.byCategory.set(category, bc);
          stateAgg.set(state, sa);
        }

        for (const item of order.line_items) {
          const key = item.sku || item.title;
          if (!skuMap[key]) {
            skuMap[key] = {
              title: item.title + (item.variant_title ? ` — ${item.variant_title}` : ""),
              sku: item.sku,
              unitsSold: 0,
              grossRevenue: 0,
              refundedUnits: 0,
              refundedRevenue: 0,
              shippingCost: 0,
              shippedUnits: 0,
              zoneAgg: new Map(),
              refundIncidents: [],
            };
          }
          skuMap[key].unitsSold += item.quantity;
          skuMap[key].grossRevenue += parseFloat(item.price) * item.quantity;
          if (orderShipping > 0) {
            const allocated = orderShipping * (item.quantity / totalQty);
            skuMap[key].shippingCost += allocated;
            skuMap[key].shippedUnits += item.quantity;
            if (zip3.length === 3) {
              const z = skuMap[key].zoneAgg.get(zip3) ?? { totalCost: 0, shipments: 0 };
              z.totalCost += allocated;
              z.shipments += item.quantity;
              skuMap[key].zoneAgg.set(zip3, z);
            }
          }
        }
      }

      // Refund aggregation: only count refunds whose own date is in the window
      // (regardless of when the original order was placed).
      for (const refund of order.refunds ?? []) {
        const refundDate = (refund.created_at ?? order.created_at).substring(0, 10);
        if (refundDate < start || refundDate > end) continue;
        for (const ri of refund.refund_line_items ?? []) {
          const key = ri.line_item?.sku ?? "";
          if (!key) continue;
          // SKU may not be in skuMap if the original sale was outside the
          // window — initialize it so refunds still surface.
          if (!skuMap[key]) {
            skuMap[key] = {
              title: ri.line_item.sku || "Unknown",
              sku: key,
              unitsSold: 0,
              grossRevenue: 0,
              refundedUnits: 0,
              refundedRevenue: 0,
              shippingCost: 0,
              shippedUnits: 0,
              zoneAgg: new Map(),
              refundIncidents: [],
            };
          }
          const amount = parseFloat(ri.subtotal ?? "0");
          skuMap[key].refundedUnits += ri.quantity;
          skuMap[key].refundedRevenue += amount;
          skuMap[key].refundIncidents.push({
            orderName: order.name,
            date: refundDate,
            quantity: ri.quantity,
            amount,
            note: refund.note ?? "",
          });
        }
      }
    }

    const products = Object.values(skuMap).map(p => {
      const netRevenue = p.grossRevenue - p.refundedRevenue;
      const netUnits = p.unitsSold - p.refundedUnits;
      const baseCostPerUnit = getCOGS(p.sku);
      // Tariff is applied as a multiplier on supplier cost. Margin is computed
      // on the LANDED cost (base + tariff) since tariff is a real cash outflow.
      const tariffPerUnit = baseCostPerUnit != null ? baseCostPerUnit * TARIFF_RATE : null;
      const landedCostPerUnit = baseCostPerUnit != null ? baseCostPerUnit + (tariffPerUnit ?? 0) : null;
      const billableUnits = Math.max(0, netUnits);
      const baseCOGS = baseCostPerUnit != null ? baseCostPerUnit * billableUnits : null;
      const totalTariff = tariffPerUnit != null ? tariffPerUnit * billableUnits : null;
      const totalCOGS = landedCostPerUnit != null ? landedCostPerUnit * billableUnits : null;
      const grossProfit = totalCOGS != null ? netRevenue - totalCOGS : null;
      const grossMarginPct = grossProfit != null && netRevenue > 0 ? (grossProfit / netRevenue) * 100 : null;
      const shippingCost = p.shippingCost;
      const avgShippingPerUnit = p.shippedUnits > 0 ? p.shippingCost / p.shippedUnits : null;
      const trueProfit = grossProfit != null ? grossProfit - shippingCost : null;
      const trueMarginPct = trueProfit != null && netRevenue > 0 ? (trueProfit / netRevenue) * 100 : null;
      const topZones = Array.from(p.zoneAgg.entries())
        .map(([zip3, z]) => ({
          zip3,
          shipments: z.shipments,
          totalCost: z.totalCost,
          avgCost: z.shipments > 0 ? z.totalCost / z.shipments : 0,
        }))
        .sort((a, b) => b.shipments - a.shipments)
        .slice(0, 10);
      const classification = classifyProductWithReason(p.sku, p.title);
      return {
        title: p.title,
        sku: p.sku,
        category: classification.category,
        categoryReason: classification.reason,
        unitsSold: p.unitsSold,
        netUnits,
        grossRevenue: p.grossRevenue,
        refundedUnits: p.refundedUnits,
        refundedRevenue: p.refundedRevenue,
        netRevenue,
        refundRate: p.unitsSold > 0 ? (p.refundedUnits / p.unitsSold) * 100 : 0,
        avgPrice: p.unitsSold > 0 ? p.grossRevenue / p.unitsSold : 0,
        costPerUnit: baseCostPerUnit,
        tariffPerUnit,
        landedCostPerUnit,
        baseCOGS,
        totalTariff,
        totalCOGS,
        grossProfit,
        grossMarginPct,
        shippingCost,
        avgShippingPerUnit,
        shippedUnits: p.shippedUnits,
        trueProfit,
        trueMarginPct,
        topZones,
        refundIncidents: p.refundIncidents.sort((a, b) => b.date.localeCompare(a.date)),
      };
    }).sort((a, b) => b.grossRevenue - a.grossRevenue);

    const totalGross = products.reduce((s, p) => s + p.grossRevenue, 0);
    const totalNet = products.reduce((s, p) => s + p.netRevenue, 0);
    const totalUnits = products.reduce((s, p) => s + p.unitsSold, 0);
    const totalBaseCOGS = products.reduce((s, p) => s + (p.baseCOGS ?? 0), 0);
    const totalTariff = products.reduce((s, p) => s + (p.totalTariff ?? 0), 0);
    const totalCOGS = products.reduce((s, p) => s + (p.totalCOGS ?? 0), 0);
    const totalProfit = products.reduce((s, p) => s + (p.grossProfit ?? 0), 0);
    const totalShipping = products.reduce((s, p) => s + (p.shippingCost ?? 0), 0);
    const totalTrueProfit = totalProfit - totalShipping;
    const shippingCoveredOrders = shippingByOrder.size;
    const coveredProducts = products.filter(p => p.costPerUnit != null).length;

    const stateBreakdown = Array.from(stateAgg.entries())
      .map(([state, sa]) => ({
        state,
        shipments: sa.shipments,
        totalCost: sa.totalCost,
        avgCost: sa.shipments > 0 ? sa.totalCost / sa.shipments : 0,
        byCategory: CATEGORY_LIST.map(cat => {
          const bc = sa.byCategory.get(cat);
          return {
            category: cat,
            shipments: bc?.shipments ?? 0,
            totalCost: bc?.totalCost ?? 0,
            avgCost: bc && bc.shipments > 0 ? bc.totalCost / bc.shipments : 0,
          };
        }),
      }))
      .sort((a, b) => b.shipments - a.shipments);

    // National per-category averages — used as the projection baseline for
    // states where we don't yet have category-level shipping data.
    const categoryNational = CATEGORY_LIST.map(cat => {
      let totalCost = 0;
      let shipments = 0;
      for (const sa of stateAgg.values()) {
        const bc = sa.byCategory.get(cat);
        if (bc) {
          totalCost += bc.totalCost;
          shipments += bc.shipments;
        }
      }
      return {
        category: cat,
        shipments,
        totalCost,
        avgCost: shipments > 0 ? totalCost / shipments : 0,
      };
    });

    const zoneBreakdown = Array.from(globalZoneAgg.entries())
      .map(([zip3, z]) => ({
        zip3,
        state: z.state,
        shipments: z.shipments,
        totalCost: z.totalCost,
        avgCost: z.shipments > 0 ? z.totalCost / z.shipments : 0,
      }))
      .sort((a, b) => b.shipments - a.shipments);

    return NextResponse.json({
      products,
      zoneBreakdown,
      stateBreakdown,
      categoryNational,
      summary: {
        totalGross,
        totalNet,
        totalUnits,
        totalBaseCOGS,
        totalTariff,
        totalCOGS,
        totalProfit,
        overallMarginPct: totalNet > 0 ? (totalProfit / totalNet) * 100 : 0,
        productCount: products.length,
        coveredProducts,
        tariffRate: TARIFF_RATE,
        totalShipping,
        totalTrueProfit,
        trueMarginPct: totalNet > 0 ? (totalTrueProfit / totalNet) * 100 : 0,
        shippingCoveredOrders,
        totalOrdersInWindow: ordersInWindow.length,
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
