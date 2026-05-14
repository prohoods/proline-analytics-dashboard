import { NextRequest, NextResponse } from "next/server";
import { getOrdersWithRefundsInWindow } from "@/lib/shopify";
import { getCOGS } from "@/lib/cogs";
import { TARIFF_RATE } from "@/lib/constants";

// Bundle analytics: two flavors
//   1. SKU'd bundles — line items whose SKU starts with `2pc-` (a real Shopify
//      bundle product, e.g. "2pc-PLSR48GE.PLJW121.48"). The bundle parses to
//      a range half + a hood half.
//   2. Implicit bundles — orders that contain both a range line item
//      (PLSR/PLST) and a hood line item (one of HOOD_SKU_PREFIXES), where
//      neither is a `2pc-` SKU. These are customers who bought a range and
//      a hood in the same checkout without using a bundle SKU.
//
// Attach rate = orders-with-range-AND-hood ÷ orders-with-range. Counts both
// flavors in the numerator; a SKU'd bundle order always satisfies this.

const RANGE_PREFIXES = ["PLSR", "PLST"];
const HOOD_PREFIXES = ["PLFW", "PLFI", "PLGW", "PLJW", "PROSW", "PLFL", "PLGI", "PLJL"];

function isBundleSku(sku: string): boolean {
  return !!sku && sku.toLowerCase().startsWith("2pc-");
}
function isRangeSku(sku: string): boolean {
  if (!sku || isBundleSku(sku)) return false;
  const u = sku.toUpperCase();
  return RANGE_PREFIXES.some((p) => u.startsWith(p));
}
function isHoodSku(sku: string): boolean {
  if (!sku || isBundleSku(sku)) return false;
  const u = sku.toUpperCase();
  return HOOD_PREFIXES.some((p) => u.startsWith(p));
}

// Parse "2pc-PLSR48GE.PLJW121.48" into { range: "PLSR48GE", hood: "PLJW121.48" }.
// Bundle SKU shape: `2pc-<range>.<hood>` where the hood may itself contain
// dots (e.g. "PLJW121.48"). We split off the range half on the first dot.
function parseBundleSku(sku: string): { range: string; hood: string } | null {
  if (!isBundleSku(sku)) return null;
  const body = sku.slice(4); // strip "2pc-"
  const firstDot = body.indexOf(".");
  if (firstDot < 0) return null;
  return { range: body.slice(0, firstDot), hood: body.slice(firstDot + 1) };
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

    function orderChannel(order: typeof orders[number]): string {
      const tags = (order.tags ?? "").toLowerCase();
      if (tags.includes("prolinepro b2b")) return "b2b";
      if (tags.includes("[]")) return "phone";
      return order.source_name === "web" || !order.source_name ? "dtc" : order.source_name;
    }
    function customerName(order: typeof orders[number]): string {
      if (!order.customer) return "";
      return (
        `${order.customer.first_name ?? ""} ${order.customer.last_name ?? ""}`.trim() ||
        (order.customer.email ?? "")
      );
    }

    // --- SKU'd bundles (one entry per bundle SKU) -----------------------------
    const skuMap: Record<string, {
      title: string;
      sku: string;
      rangePart: string;
      hoodPart: string;
      orderNames: Set<string>;
      unitsSold: number;
      grossRevenue: number;
      refundedUnits: number;
      refundedRevenue: number;
      firstSold: string | null;
      lastSold: string | null;
    }> = {};

    interface BundleSale {
      date: string;
      orderName: string;
      kind: "skud" | "implicit";
      bundleSku?: string;
      rangeSku: string;
      hoodSku: string;
      quantity: number;
      revenue: number;
      customer: string;
      state: string;
      channel: string;
    }
    const bundleSales: BundleSale[] = [];

    // --- Implicit bundles (one entry per range+hood combo) --------------------
    type ComboKey = string; // `${range}|${hood}`
    const comboMap: Record<ComboKey, {
      rangeSku: string;
      hoodSku: string;
      orderNames: Set<string>;
      rangeUnits: number;
      hoodUnits: number;
      grossRevenue: number;
    }> = {};

    // Attach rate accounting
    let ordersWithRange = 0;
    let ordersWithRangeAndHood = 0;
    let skudBundleOrders = 0;
    let implicitBundleOrders = 0;

    const orderInWindow = (order: typeof orders[number]) => {
      const d = order.created_at.substring(0, 10);
      return d >= start && d <= end;
    };

    for (const order of orders) {
      if (orderInWindow(order)) {
        const orderDate = order.created_at.substring(0, 10);
        const cust = customerName(order);
        const state = order.shipping_address?.province_code ?? "";
        const channel = orderChannel(order);

        const bundleLines = order.line_items.filter((li) => isBundleSku(li.sku));
        const rangeLines = order.line_items.filter((li) => isRangeSku(li.sku));
        const hoodLines = order.line_items.filter((li) => isHoodSku(li.sku));

        const hasAnyRange = bundleLines.length > 0 || rangeLines.length > 0;
        const hasAnyHood = bundleLines.length > 0 || hoodLines.length > 0;
        if (hasAnyRange) ordersWithRange += 1;
        if (hasAnyRange && hasAnyHood) ordersWithRangeAndHood += 1;
        if (bundleLines.length > 0) skudBundleOrders += 1;
        if (bundleLines.length === 0 && rangeLines.length > 0 && hoodLines.length > 0) {
          implicitBundleOrders += 1;
        }

        // SKU'd bundles: one row per bundle SKU
        for (const li of bundleLines) {
          const parsed = parseBundleSku(li.sku);
          if (!skuMap[li.sku]) {
            skuMap[li.sku] = {
              title: li.title + (li.variant_title ? ` — ${li.variant_title}` : ""),
              sku: li.sku,
              rangePart: parsed?.range ?? "",
              hoodPart: parsed?.hood ?? "",
              orderNames: new Set(),
              unitsSold: 0,
              grossRevenue: 0,
              refundedUnits: 0,
              refundedRevenue: 0,
              firstSold: null,
              lastSold: null,
            };
          }
          skuMap[li.sku].orderNames.add(order.name);
          skuMap[li.sku].unitsSold += li.quantity;
          const lineRevenue = parseFloat(li.price) * li.quantity;
          skuMap[li.sku].grossRevenue += lineRevenue;
          if (!skuMap[li.sku].firstSold || orderDate < skuMap[li.sku].firstSold!) skuMap[li.sku].firstSold = orderDate;
          if (!skuMap[li.sku].lastSold || orderDate > skuMap[li.sku].lastSold!) skuMap[li.sku].lastSold = orderDate;
          bundleSales.push({
            date: orderDate,
            orderName: order.name,
            kind: "skud",
            bundleSku: li.sku,
            rangeSku: parsed?.range ?? "",
            hoodSku: parsed?.hood ?? "",
            quantity: li.quantity,
            revenue: lineRevenue,
            customer: cust,
            state,
            channel,
          });
        }

        // Implicit bundles: enumerate range × hood pairs within the same order.
        // If a customer bought 1 PLSR48 + 1 PLJW121, we attribute to that combo
        // once. If they bought 2 ranges and 1 hood, we still treat it as a
        // single combo occurrence (use min(qty) for the pair count).
        if (bundleLines.length === 0 && rangeLines.length > 0 && hoodLines.length > 0) {
          for (const r of rangeLines) {
            for (const h of hoodLines) {
              const key = `${r.sku}|${h.sku}`;
              if (!comboMap[key]) {
                comboMap[key] = {
                  rangeSku: r.sku,
                  hoodSku: h.sku,
                  orderNames: new Set(),
                  rangeUnits: 0,
                  hoodUnits: 0,
                  grossRevenue: 0,
                };
              }
              comboMap[key].orderNames.add(order.name);
              const pairCount = Math.min(r.quantity, h.quantity);
              comboMap[key].rangeUnits += r.quantity;
              comboMap[key].hoodUnits += h.quantity;
              const pairRevenue = parseFloat(r.price) * pairCount + parseFloat(h.price) * pairCount;
              comboMap[key].grossRevenue += pairRevenue;
              bundleSales.push({
                date: orderDate,
                orderName: order.name,
                kind: "implicit",
                rangeSku: r.sku,
                hoodSku: h.sku,
                quantity: pairCount,
                revenue: pairRevenue,
                customer: cust,
                state,
                channel,
              });
            }
          }
        }
      }

      // Refunds on SKU'd bundles only (implicit bundle refunds get caught on
      // the underlying SKU pages).
      for (const refund of order.refunds ?? []) {
        const refundDate = (refund.created_at ?? order.created_at).substring(0, 10);
        if (refundDate < start || refundDate > end) continue;
        for (const ri of refund.refund_line_items ?? []) {
          const sku = ri.line_item?.sku ?? "";
          if (!isBundleSku(sku)) continue;
          if (!skuMap[sku]) {
            const parsed = parseBundleSku(sku);
            skuMap[sku] = {
              title: sku,
              sku,
              rangePart: parsed?.range ?? "",
              hoodPart: parsed?.hood ?? "",
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

    // COGS for SKU'd bundles = COGS(range) + COGS(hood). If either is unknown,
    // we drop to null and surface "no cogs" in the UI.
    const skuBundles = Object.values(skuMap).map((b) => {
      const netRevenue = b.grossRevenue - b.refundedRevenue;
      const netUnits = b.unitsSold - b.refundedUnits;
      const rangeCost = b.rangePart ? getCOGS(b.rangePart) : null;
      const hoodCost = b.hoodPart ? getCOGS(b.hoodPart) : null;
      const baseCostPerUnit =
        rangeCost != null && hoodCost != null ? rangeCost + hoodCost : null;
      const landedCostPerUnit =
        baseCostPerUnit != null ? baseCostPerUnit * (1 + TARIFF_RATE) : null;
      const billableUnits = Math.max(0, netUnits);
      const totalCOGS = landedCostPerUnit != null ? landedCostPerUnit * billableUnits : null;
      const grossProfit = totalCOGS != null ? netRevenue - totalCOGS : null;
      const grossMarginPct = grossProfit != null && netRevenue > 0 ? (grossProfit / netRevenue) * 100 : null;
      return {
        title: b.title,
        sku: b.sku,
        rangePart: b.rangePart,
        hoodPart: b.hoodPart,
        orderCount: b.orderNames.size,
        unitsSold: b.unitsSold,
        netUnits,
        grossRevenue: b.grossRevenue,
        refundedUnits: b.refundedUnits,
        refundedRevenue: b.refundedRevenue,
        netRevenue,
        avgPrice: b.unitsSold > 0 ? b.grossRevenue / b.unitsSold : 0,
        rangeCost,
        hoodCost,
        landedCostPerUnit,
        totalCOGS,
        grossProfit,
        grossMarginPct,
        firstSold: b.firstSold,
        lastSold: b.lastSold,
      };
    }).sort((a, b) => b.grossRevenue - a.grossRevenue);

    bundleSales.sort((a, b) => b.date.localeCompare(a.date) || b.orderName.localeCompare(a.orderName));

    const implicitBundles = Object.values(comboMap).map((c) => ({
      rangeSku: c.rangeSku,
      hoodSku: c.hoodSku,
      orderCount: c.orderNames.size,
      rangeUnits: c.rangeUnits,
      hoodUnits: c.hoodUnits,
      grossRevenue: c.grossRevenue,
    })).sort((a, b) => b.orderCount - a.orderCount);

    const summary = {
      skudBundles: {
        productCount: skuBundles.length,
        orders: skudBundleOrders,
        unitsSold: skuBundles.reduce((s, p) => s + p.unitsSold, 0),
        netRevenue: skuBundles.reduce((s, p) => s + p.netRevenue, 0),
        grossProfit: skuBundles.reduce((s, p) => s + (p.grossProfit ?? 0), 0),
      },
      implicitBundles: {
        comboCount: implicitBundles.length,
        orders: implicitBundleOrders,
        grossRevenue: implicitBundles.reduce((s, c) => s + c.grossRevenue, 0),
      },
      attachRate: {
        ordersWithRange,
        ordersWithRangeAndHood,
        rate: ordersWithRange > 0 ? (ordersWithRangeAndHood / ordersWithRange) * 100 : 0,
      },
      tariffRate: TARIFF_RATE,
    };

    return NextResponse.json({ skuBundles, implicitBundles, summary, sales: bundleSales }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
