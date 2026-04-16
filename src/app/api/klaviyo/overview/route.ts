import { NextRequest, NextResponse } from "next/server";
import { klaviyoGet, klaviyoGetAll, klaviyoPost, getPlacedOrderMetricId } from "@/lib/klaviyo";

export async function GET(request: NextRequest) {
  try {
    if (!process.env.KLAVIYO_API_KEY) {
      return NextResponse.json({ error: "KLAVIYO_API_KEY not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get("timeframe") ?? "last_30_days";

    const [profilesRes, listsData, metricId] = await Promise.all([
      klaviyoGet("/profiles/", { "page[size]": "1" }),
      klaviyoGetAll("/lists/", { "fields[list]": "name" }),
      getPlacedOrderMetricId(),
    ]);

    const totalProfiles: number = profilesRes.meta?.total_count ?? null;
    const lists = listsData.map((l: Record<string, unknown>) => ({
      id: l.id,
      name: (l.attributes as Record<string, unknown>)?.name ?? "Unknown",
    }));

    let stats = {
      campaignDelivered: 0,
      campaignOpens: 0,
      campaignClicks: 0,
      campaignBounced: 0,
      campaignUnsubscribed: 0,
      campaignRevenue: 0,
      avgOpenRate: 0,
      avgClickRate: 0,
      avgBounceRate: 0,
      avgUnsubRate: 0,
      flowRevenue: 0,
      flowDelivered: 0,
      flowOpens: 0,
      flowClicks: 0,
      totalEmailRevenue: 0,
    };

    if (metricId) {
      const reportBody = (type: string) => ({
        data: {
          type,
          attributes: {
            timeframe: { key: timeframe },
            conversion_metric_id: metricId,
            statistics: ["opens", "open_rate", "clicks", "click_rate", "delivered", "conversion_value", "bounced", "unsubscribes"],
            ...(type === "campaign-values-report" ? { filter: "equals(send_channel,'email')" } : {}),
          },
        },
      });

      const [campaignStats, flowStats] = await Promise.all([
        klaviyoPost("/campaign-values-reports/", reportBody("campaign-values-report")),
        klaviyoPost("/flow-values-reports/", reportBody("flow-values-report")),
      ]);

      for (const r of campaignStats?.data?.attributes?.results ?? []) {
        stats.campaignDelivered    += r.statistics?.delivered ?? 0;
        stats.campaignOpens        += r.statistics?.opens ?? 0;
        stats.campaignClicks       += r.statistics?.clicks ?? 0;
        stats.campaignBounced      += r.statistics?.bounced ?? 0;
        stats.campaignUnsubscribed += r.statistics?.unsubscribes ?? 0;
        stats.campaignRevenue      += r.statistics?.conversion_value ?? 0;
      }

      // Weighted averages (correct)
      stats.avgOpenRate  = stats.campaignDelivered > 0 ? stats.campaignOpens   / stats.campaignDelivered : 0;
      stats.avgClickRate = stats.campaignDelivered > 0 ? stats.campaignClicks  / stats.campaignDelivered : 0;
      stats.avgBounceRate = stats.campaignDelivered > 0 ? stats.campaignBounced / stats.campaignDelivered : 0;
      stats.avgUnsubRate = stats.campaignDelivered > 0 ? stats.campaignUnsubscribed / stats.campaignDelivered : 0;

      for (const r of flowStats?.data?.attributes?.results ?? []) {
        stats.flowDelivered += r.statistics?.delivered ?? 0;
        stats.flowOpens     += r.statistics?.opens ?? 0;
        stats.flowClicks    += r.statistics?.clicks ?? 0;
        stats.flowRevenue   += r.statistics?.conversion_value ?? 0;
      }

      stats.totalEmailRevenue = stats.campaignRevenue + stats.flowRevenue;
    }

    return NextResponse.json({ totalProfiles, lists, stats, timeframe });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
