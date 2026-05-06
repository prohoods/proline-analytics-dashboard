import { NextResponse } from "next/server";
import { getOrdersWithRefundsInWindow } from "@/lib/shopify";
import { getShippingByOrder } from "@/lib/db";
import { classifyOrder, classifyProductWithReason, CATEGORY_LIST, type ProductCategory } from "@/lib/categories";

// Returns trailing-30-day shipping aggregates used by the projections panel.
// Always uses today−30 → today regardless of the page's date filter — the
// point of projections is a stable run-rate baseline, not whatever window
// the user happens to be viewing.
export async function GET() {
  try {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);

    const { orders } = await getOrdersWithRefundsInWindow(start, end);
    const ordersInWindow = orders.filter(o => {
      const d = o.created_at.substring(0, 10);
      return d >= start && d <= end;
    });
    const shippingByOrder = await getShippingByOrder(ordersInWindow.map(o => o.name));

    // State × category → avg shipping. Drives both the heatmap and the
    // per-product cost-to-ship estimator.
    type Bucket = { totalCost: number; shipments: number };
    const stateCategoryAgg = new Map<string, Map<ProductCategory, Bucket>>();
    const categoryNational = new Map<ProductCategory, Bucket>();
    const stateTotals = new Map<string, Bucket>();
    let grandTotalCost = 0;
    let grandTotalShipments = 0;

    // Catalog: SKU → { title, category, avg sale price, units sold }. Used by
    // the per-product calculator; we display the product picker against this.
    type CatRow = { title: string; category: ProductCategory; price: number; units: number; revenue: number };
    const catalog = new Map<string, CatRow>();

    for (const order of ordersInWindow) {
      const orderShipping = shippingByOrder.get(order.name) ?? 0;
      const state = order.shipping_address?.province_code ?? "";

      for (const li of order.line_items) {
        const sku = li.sku || li.title;
        const cls = classifyProductWithReason(li.sku, li.title);
        const c = catalog.get(sku) ?? { title: li.title, category: cls.category, price: 0, units: 0, revenue: 0 };
        c.units += li.quantity;
        c.revenue += parseFloat(li.price) * li.quantity;
        c.price = c.units > 0 ? c.revenue / c.units : 0;
        catalog.set(sku, c);
      }

      if (orderShipping > 0 && state) {
        const category = classifyOrder(order.line_items.map(li => ({ sku: li.sku, title: li.title })));
        grandTotalCost += orderShipping;
        grandTotalShipments += 1;

        const sc = stateCategoryAgg.get(state) ?? new Map<ProductCategory, Bucket>();
        const b = sc.get(category) ?? { totalCost: 0, shipments: 0 };
        b.totalCost += orderShipping;
        b.shipments += 1;
        sc.set(category, b);
        stateCategoryAgg.set(state, sc);

        const st = stateTotals.get(state) ?? { totalCost: 0, shipments: 0 };
        st.totalCost += orderShipping;
        st.shipments += 1;
        stateTotals.set(state, st);

        const nat = categoryNational.get(category) ?? { totalCost: 0, shipments: 0 };
        nat.totalCost += orderShipping;
        nat.shipments += 1;
        categoryNational.set(category, nat);
      }
    }

    const stateAvgs = Array.from(stateTotals.entries()).map(([state, b]) => ({
      state,
      shipments: b.shipments,
      totalCost: b.totalCost,
      avgCost: b.shipments > 0 ? b.totalCost / b.shipments : 0,
      byCategory: CATEGORY_LIST.map(cat => {
        const bucket = stateCategoryAgg.get(state)?.get(cat);
        return {
          category: cat,
          shipments: bucket?.shipments ?? 0,
          avgCost: bucket && bucket.shipments > 0 ? bucket.totalCost / bucket.shipments : 0,
        };
      }),
    }));

    const categoryAvgs = CATEGORY_LIST.map(cat => {
      const b = categoryNational.get(cat);
      return {
        category: cat,
        shipments: b?.shipments ?? 0,
        avgCost: b && b.shipments > 0 ? b.totalCost / b.shipments : 0,
      };
    });

    const catalogList = Array.from(catalog.entries())
      .map(([sku, c]) => ({ sku, ...c }))
      .filter(c => c.units > 0)
      .sort((a, b) => b.units - a.units);

    return NextResponse.json({
      windowStart: start,
      windowEnd: end,
      windowDays: 30,
      grandTotalCost,
      grandTotalShipments,
      grandAvgPerShipment: grandTotalShipments > 0 ? grandTotalCost / grandTotalShipments : 0,
      // Forecast next 30 days at current run-rate. The user can refine this
      // later (e.g. add seasonality), but flat run-rate is the right v1.
      projectedNext30Days: grandTotalCost,
      stateAvgs,
      categoryAvgs,
      catalog: catalogList,
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
