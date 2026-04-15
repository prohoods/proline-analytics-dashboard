import { NextResponse } from "next/server";
import { klaviyoGet, klaviyoPost, getPlacedOrderMetricId } from "@/lib/klaviyo";

export async function GET() {
  try {
    if (!process.env.KLAVIYO_API_KEY) {
      return NextResponse.json({ error: "KLAVIYO_API_KEY not configured" }, { status: 500 });
    }

    const [campaignsRes, metricId] = await Promise.all([
      klaviyoGet("/campaigns/", {
        "filter": "equals(messages.channel,'email')",
        "sort": "-created_at",
        "fields[campaign]": "name,status,created_at,send_time",
      }),
      getPlacedOrderMetricId(),
    ]);

    const campaigns: any[] = campaignsRes.data ?? [];

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
            statistics: ["opens", "open_rate", "clicks", "click_rate", "delivered", "conversion_value", "bounced", "unsubscribes"],
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
      const revenue = stats.conversion_value ?? null;
      const delivered = stats.delivered ?? null;
      return {
        id: c.id,
        name: c.attributes?.name ?? "—",
        status: c.attributes?.status ?? "—",
        sentAt: c.attributes?.send_time ?? c.attributes?.created_at ?? null,
        delivered,
        opens: stats.opens ?? null,
        openRate: stats.open_rate ?? null,
        clicks: stats.clicks ?? null,
        clickRate: stats.click_rate ?? null,
        revenue,
        bounced: stats.bounced ?? null,
        unsubscribed: stats.unsubscribes ?? null,
        revenuePerEmail: delivered && delivered > 0 ? (revenue ?? 0) / delivered : null,
      };
    });

    return NextResponse.json({ campaigns: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
