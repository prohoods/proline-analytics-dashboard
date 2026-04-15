import { NextResponse } from "next/server";
import { klaviyoGet, klaviyoPost, getPlacedOrderMetricId } from "@/lib/klaviyo";

export async function GET() {
  try {
    if (!process.env.KLAVIYO_API_KEY) {
      return NextResponse.json({ error: "KLAVIYO_API_KEY not configured" }, { status: 500 });
    }

    // Fetch campaigns (email only, sorted newest first) + metric ID in parallel
    const [campaignsRes, metricId] = await Promise.all([
      klaviyoGet("/campaigns/", {
        "filter": "equals(messages.channel,'email')",
        "sort": "-created_at",
        "page[size]": "50",
        "fields[campaign]": "name,status,created_at,send_time",
      }),
      getPlacedOrderMetricId(),
    ]);

    const campaigns: any[] = campaignsRes.data ?? [];

    // Only fetch stats for sent campaigns
    const sentIds = campaigns
      .filter((c: any) => c.attributes?.status === "Sent")
      .map((c: any) => c.id);

    let statsMap: Record<string, any> = {};

    if (metricId && sentIds.length > 0) {
      const statsRes = await klaviyoPost("/campaign-values-reports/", {
        data: {
          type: "campaign-values-report",
          attributes: {
            timeframe: { key: "last_365_days" },
            conversion_metric_id: metricId,
            statistics: ["opens", "open_rate", "clicks", "click_rate", "delivered", "revenue", "bounced", "unsubscribed"],
            filter: "equals(send_channel,'email')",
          },
        },
      });

      for (const r of statsRes?.data?.attributes?.results ?? []) {
        const id = r.groupings?.campaign_id;
        if (id) statsMap[id] = r.statistics;
      }
    }

    const rows = campaigns.map((c: any) => {
      const stats = statsMap[c.id] ?? {};
      return {
        id: c.id,
        name: c.attributes?.name ?? "—",
        status: c.attributes?.status ?? "—",
        sentAt: c.attributes?.send_time ?? c.attributes?.created_at ?? null,
        delivered: stats.delivered ?? null,
        opens: stats.opens ?? null,
        openRate: stats.open_rate ?? null,
        clicks: stats.clicks ?? null,
        clickRate: stats.click_rate ?? null,
        revenue: stats.revenue ?? null,
        bounced: stats.bounced ?? null,
        unsubscribed: stats.unsubscribed ?? null,
        revenuePerEmail: stats.delivered > 0 ? (stats.revenue ?? 0) / stats.delivered : null,
      };
    });

    return NextResponse.json({ campaigns: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
