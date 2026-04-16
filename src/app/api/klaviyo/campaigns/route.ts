import { NextRequest, NextResponse } from "next/server";
import { klaviyoGet, klaviyoPost, getPlacedOrderMetricId } from "@/lib/klaviyo";

export async function GET(request: NextRequest) {
  try {
    if (!process.env.KLAVIYO_API_KEY) {
      return NextResponse.json({ error: "KLAVIYO_API_KEY not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get("timeframe") ?? "last_365_days";

    const [campaignsRes, metricId] = await Promise.all([
      klaviyoGet("/campaigns/", {
        "filter": "equals(messages.channel,'email')",
        "sort": "-created_at",
        "fields[campaign]": "name,status,created_at,send_time",
      }),
      getPlacedOrderMetricId(),
    ]);

    const campaigns: Record<string, unknown>[] = campaignsRes.data ?? [];
    const sentIds = campaigns
      .filter((c) => (c.attributes as Record<string, unknown>)?.status === "Sent")
      .map((c) => c.id);

    const statsMap: Record<string, Record<string, number>> = {};

    if (metricId && sentIds.length > 0) {
      const statsRes = await klaviyoPost("/campaign-values-reports/", {
        data: {
          type: "campaign-values-report",
          attributes: {
            timeframe: { key: timeframe },
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

    const rows = campaigns.map((c) => {
      const attrs = c.attributes as Record<string, unknown>;
      const stats = statsMap[c.id as string] ?? {};
      const revenue = stats.conversion_value ?? null;
      const delivered = stats.delivered ?? null;
      return {
        id: c.id,
        name: attrs?.name ?? "—",
        status: attrs?.status ?? "—",
        sentAt: attrs?.send_time ?? attrs?.created_at ?? null,
        delivered,
        opens: stats.opens ?? null,
        openRate: delivered && (delivered as number) > 0 && stats.opens != null
          ? (stats.opens as number) / (delivered as number) : stats.open_rate ?? null,
        clicks: stats.clicks ?? null,
        clickRate: delivered && (delivered as number) > 0 && stats.clicks != null
          ? (stats.clicks as number) / (delivered as number) : stats.click_rate ?? null,
        revenue,
        bounced: stats.bounced ?? null,
        bounceRate: delivered && (delivered as number) > 0 && stats.bounced != null
          ? (stats.bounced as number) / (delivered as number) : null,
        unsubscribed: stats.unsubscribes ?? null,
        unsubRate: delivered && (delivered as number) > 0 && stats.unsubscribes != null
          ? (stats.unsubscribes as number) / (delivered as number) : null,
        revenuePerEmail: delivered && (delivered as number) > 0 ? (revenue as number ?? 0) / (delivered as number) : null,
      };
    });

    return NextResponse.json({ campaigns: rows, timeframe });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
