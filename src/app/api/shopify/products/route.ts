import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";
import { getCOGS } from "@/lib/cogs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00&financial_status=any&status=any`;
    const { orders } = await getOrders(params);

    const skuMap: Record<string, {
      title: string;
      sku: string;
      unitsSold: number;
      grossRevenue: number;
      refundedUnits: number;
      refundedRevenue: number;
    }> = {};

    for (const order of orders) {
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
          };
        }
        skuMap[key].unitsSold += item.quantity;
        skuMap[key].grossRevenue += parseFloat(item.price) * item.quantity;
      }

      for (const refund of order.refunds ?? []) {
        for (const ri of refund.refund_line_items ?? []) {
          const key = ri.line_item?.sku ?? "";
          if (key && skuMap[key]) {
            skuMap[key].refundedUnits += ri.quantity;
            skuMap[key].refundedRevenue += parseFloat(ri.subtotal ?? "0");
          }
        }
      }
    }

    const products = Object.values(skuMap).map(p => {
      const netRevenue = p.grossRevenue - p.refundedRevenue;
      const netUnits = p.unitsSold - p.refundedUnits;
      const costPerUnit = getCOGS(p.sku);
      const totalCOGS = costPerUnit != null ? costPerUnit * Math.max(0, netUnits) : null;
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
        costPerUnit,
        totalCOGS,
        grossProfit,
        grossMarginPct,
      };
    }).sort((a, b) => b.grossRevenue - a.grossRevenue);

    const totalGross = products.reduce((s, p) => s + p.grossRevenue, 0);
    const totalNet = products.reduce((s, p) => s + p.netRevenue, 0);
    const totalUnits = products.reduce((s, p) => s + p.unitsSold, 0);
    const totalCOGS = products.reduce((s, p) => s + (p.totalCOGS ?? 0), 0);
    const totalProfit = products.reduce((s, p) => s + (p.grossProfit ?? 0), 0);
    const coveredProducts = products.filter(p => p.costPerUnit != null).length;

    return NextResponse.json({
      products,
      summary: {
        totalGross,
        totalNet,
        totalUnits,
        totalCOGS,
        totalProfit,
        overallMarginPct: totalNet > 0 ? (totalProfit / totalNet) * 100 : 0,
        productCount: products.length,
        coveredProducts,
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
