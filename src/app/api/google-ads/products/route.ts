import { NextRequest, NextResponse } from "next/server";
import { googleAdsQuery } from "@/lib/google-ads";
import { shopifyFetch } from "@/lib/shopify";
import { getCOGS } from "@/lib/cogs";

interface ShoppingRow {
  segments: {
    productItemId: string;
    productTitle: string;
  };
  metrics: {
    costMicros: string;
    conversionsValue: number;
    conversions: number;
    clicks: string;
    impressions: string;
  };
}

interface ShopifyVariant {
  id: number;
  sku: string;
  product_id: number;
  title: string;
}

// Extract numeric variant ID from Google Shopping product item IDs
// Handles: "shopify_US_49014031024430", "online:en:US:shopify_US_49014031024430", raw numerics
function extractVariantId(itemId: string): string | null {
  if (!itemId) return null;
  const match = itemId.match(/(\d{10,})$/);
  return match ? match[1] : null;
}

export async function GET(request: NextRequest) {
  try {
    if (!process.env.GOOGLE_ADS_CUSTOMER_ID) {
      return NextResponse.json({ error: "Google Ads not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start") ?? new Date(new Date().getFullYear(), 0, 1).toISOString().substring(0, 10);
    const end = searchParams.get("end") ?? new Date().toISOString().substring(0, 10);

    const query = `
      SELECT
        segments.product_item_id,
        segments.product_title,
        metrics.cost_micros,
        metrics.conversions_value,
        metrics.conversions,
        metrics.clicks,
        metrics.impressions
      FROM shopping_performance_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND metrics.impressions > 0
      ORDER BY metrics.cost_micros DESC
      LIMIT 500
    `;

    const rows = await googleAdsQuery<ShoppingRow[]>(query);

    // Aggregate by product_item_id (Google returns one row per day per product)
    const aggMap: Record<string, {
      productItemId: string;
      productTitle: string;
      costMicros: number;
      conversionsValue: number;
      conversions: number;
      clicks: number;
      impressions: number;
    }> = {};

    for (const row of rows) {
      const id = row.segments?.productItemId ?? "";
      if (!id) continue;
      if (!aggMap[id]) {
        aggMap[id] = {
          productItemId: id,
          productTitle: row.segments?.productTitle ?? "",
          costMicros: 0,
          conversionsValue: 0,
          conversions: 0,
          clicks: 0,
          impressions: 0,
        };
      }
      aggMap[id].costMicros += parseInt(row.metrics?.costMicros ?? "0");
      aggMap[id].conversionsValue += row.metrics?.conversionsValue ?? 0;
      aggMap[id].conversions += row.metrics?.conversions ?? 0;
      aggMap[id].clicks += parseInt(row.metrics?.clicks ?? "0");
      aggMap[id].impressions += parseInt(row.metrics?.impressions ?? "0");
    }

    const aggregated = Object.values(aggMap).filter(r => r.costMicros > 0);

    // Extract variant IDs and batch-fetch SKUs from Shopify
    const variantIds = aggregated
      .map(r => extractVariantId(r.productItemId))
      .filter((id): id is string => id !== null);

    const variantSkuMap: Record<string, string> = {};

    if (variantIds.length > 0) {
      // Shopify allows up to 100 IDs per request
      const chunks: string[][] = [];
      for (let i = 0; i < variantIds.length; i += 100) {
        chunks.push(variantIds.slice(i, i + 100));
      }
      await Promise.all(chunks.map(async chunk => {
        try {
          const data = await shopifyFetch<{ variants: ShopifyVariant[] }>(
            `variants.json?ids=${chunk.join(",")}&fields=id,sku,product_id,title`
          );
          for (const v of data.variants ?? []) {
            if (v.sku) variantSkuMap[String(v.id)] = v.sku;
          }
        } catch {
          // Non-fatal — we'll show Google data without SKU match
        }
      }));
    }

    // Build final rows
    const products = aggregated.map(r => {
      const variantId = extractVariantId(r.productItemId) ?? "";
      const sku = variantSkuMap[variantId] ?? null;
      const costPerUnit = sku ? getCOGS(sku) : null;
      const adSpend = r.costMicros / 1_000_000;
      const adRevenue = r.conversionsValue;
      const roas = adSpend > 0 ? adRevenue / adSpend : null;
      const ctr = r.impressions > 0 ? r.clicks / r.impressions : 0;
      const cpc = r.clicks > 0 ? adSpend / r.clicks : null;
      const cvr = r.clicks > 0 ? r.conversions / r.clicks : 0;

      return {
        productItemId: r.productItemId,
        productTitle: r.productTitle,
        sku,
        variantId,
        adSpend,
        adRevenue,
        conversions: r.conversions,
        clicks: r.clicks,
        impressions: r.impressions,
        roas,
        ctr,
        cpc,
        cvr,
        costPerUnit,
      };
    }).sort((a, b) => b.adSpend - a.adSpend);

    const totalSpend = products.reduce((s, p) => s + p.adSpend, 0);
    const totalAdRevenue = products.reduce((s, p) => s + p.adRevenue, 0);
    const totalClicks = products.reduce((s, p) => s + p.clicks, 0);
    const totalImpressions = products.reduce((s, p) => s + p.impressions, 0);
    const totalConversions = products.reduce((s, p) => s + p.conversions, 0);
    const matchedCount = products.filter(p => p.sku !== null).length;

    return NextResponse.json({
      products,
      summary: {
        totalSpend,
        totalAdRevenue,
        totalRoas: totalSpend > 0 ? totalAdRevenue / totalSpend : 0,
        totalClicks,
        totalImpressions,
        totalConversions,
        productCount: products.length,
        matchedCount,
      },
      dateRange: { start, end },
    }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
