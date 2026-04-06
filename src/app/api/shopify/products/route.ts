import { NextRequest, NextResponse } from "next/server";
import { shopifyFetch } from "@/lib/shopify";

interface LineItem {
  title: string;
  sku: string;
  quantity: number;
  price: string;
  variant_title: string | null;
}

interface Refund {
  refund_line_items: { line_item: { sku: string }; quantity: number; subtotal: string }[];
}

interface Order {
  id: number;
  created_at: string;
  financial_status: string;
  line_items: LineItem[];
  refunds: Refund[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00&financial_status=any&status=any&limit=250`;
    const data = await shopifyFetch<{ orders: Order[] }>(`orders.json?${params}`);
    const orders = data.orders;

    // Aggregate by SKU
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

      // Track refunds per SKU
      for (const refund of order.refunds) {
        for (const ri of refund.refund_line_items) {
          const key = ri.line_item.sku;
          if (skuMap[key]) {
            skuMap[key].refundedUnits += ri.quantity;
            skuMap[key].refundedRevenue += parseFloat(ri.subtotal);
          }
        }
      }
    }

    const products = Object.values(skuMap)
      .map(p => ({
        ...p,
        netRevenue: p.grossRevenue - p.refundedRevenue,
        netUnits: p.unitsSold - p.refundedUnits,
        refundRate: p.unitsSold > 0 ? (p.refundedUnits / p.unitsSold) * 100 : 0,
        avgOrderValue: p.unitsSold > 0 ? p.grossRevenue / p.unitsSold : 0,
      }))
      .sort((a, b) => b.grossRevenue - a.grossRevenue);

    const totalGross = products.reduce((s, p) => s + p.grossRevenue, 0);
    const totalNet = products.reduce((s, p) => s + p.netRevenue, 0);
    const totalUnits = products.reduce((s, p) => s + p.unitsSold, 0);

    return NextResponse.json({
      products,
      summary: { totalGross, totalNet, totalUnits, productCount: products.length },
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
