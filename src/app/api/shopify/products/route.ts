import { NextRequest, NextResponse } from "next/server";
import { getOrdersWithRefundsInWindow } from "@/lib/shopify";
import { getCOGS } from "@/lib/cogs";
import { TARIFF_RATE } from "@/lib/constants";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    const { orders } = await getOrdersWithRefundsInWindow(start, end);

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
      refundIncidents: RefundIncident[];
    }> = {};

    const orderInWindow = (order: typeof orders[number]) => {
      const d = order.created_at.substring(0, 10);
      return d >= start && d <= end;
    };

    for (const order of orders) {
      // Sales aggregation: only count orders created in the window. Cross-window
      // orders only made it into the result set because of refund activity.
      if (orderInWindow(order)) {
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
              refundIncidents: [],
            };
          }
          skuMap[key].unitsSold += item.quantity;
          skuMap[key].grossRevenue += parseFloat(item.price) * item.quantity;
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
      return {
        title: p.title,
        sku: p.sku,
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
    const coveredProducts = products.filter(p => p.costPerUnit != null).length;

    return NextResponse.json({
      products,
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
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
