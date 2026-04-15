import { NextResponse } from "next/server";
import { klaviyoGet, klaviyoPost, getPlacedOrderMetricId } from "@/lib/klaviyo";

export async function GET() {
  try {
    if (!process.env.KLAVIYO_API_KEY) {
      return NextResponse.json({ error: "KLAVIYO_API_KEY not configured" }, { status: 500 });
    }

    // Parallel: profiles count + lists + metric ID
    // Note: profile_count is not a valid field for lists — only name/id/created/updated/opt_in_process
    const [profilesRes, listsRes, metricId] = await Promise.all([
      klaviyoGet("/profiles/", { "page[size]": "1" }),
      klaviyoGet("/lists/", { "fields[list]": "name", "page[size]": "100" }),
      getPlacedOrderMetricId(),
    ]);

    const totalProfiles: number = profilesRes.meta?.total_count ?? null;

    const lists = (listsRes.data ?? []).map((l: any) => ({
      id: l.id,
      name: l.attributes?.name ?? "Unknown",
    }));

    // Revenue reports — only if we found the metric
    // Klaviyo uses "sum_value" for revenue attribution, not "revenue"
    let last30Days = {
      campaignDelivered: 0,
      campaignOpens: 0,
      campaignClicks: 0,
      campaignRevenue: 0,
      avgOpenRate: 0,
      avgClickRate: 0,
      flowRevenue: 0,
      flowDelivered: 0,
      totalEmailRevenue: 0,
    };

    if (metricId) {
      const reportBody = (type: string) => ({
        data: {
          type,
          attributes: {
            timeframe: { key: "last_30_days" },
            conversion_metric_id: metricId,
            statistics: ["opens", "open_rate", "clicks", "click_rate", "delivered", "sum_value"],
            ...(type === "campaign-values-report" ? { filter: "equals(send_channel,'email')" } : {}),
          },
        },
      });

      const [campaignStats, flowStats] = await Promise.all([
        klaviyoPost("/campaign-values-reports/", reportBody("campaign-values-report")),
        klaviyoPost("/flow-values-reports/", reportBody("flow-values-report")),
      ]);

      let statCount = 0;
      let sumOpenRate = 0;
      let sumClickRate = 0;

      for (const r of campaignStats?.data?.attributes?.results ?? []) {
        last30Days.campaignDelivered += r.statistics?.delivered ?? 0;
        last30Days.campaignOpens += r.statistics?.opens ?? 0;
        last30Days.campaignClicks += r.statistics?.clicks ?? 0;
        last30Days.campaignRevenue += r.statistics?.sum_value ?? 0;
        if ((r.statistics?.delivered ?? 0) > 0) {
          sumOpenRate += r.statistics?.open_rate ?? 0;
          sumClickRate += r.statistics?.click_rate ?? 0;
          statCount++;
        }
      }

      last30Days.avgOpenRate = statCount > 0 ? sumOpenRate / statCount : 0;
      last30Days.avgClickRate = statCount > 0 ? sumClickRate / statCount : 0;

      for (const r of flowStats?.data?.attributes?.results ?? []) {
        last30Days.flowDelivered += r.statistics?.delivered ?? 0;
        last30Days.flowRevenue += r.statistics?.sum_value ?? 0;
      }

      last30Days.totalEmailRevenue = last30Days.campaignRevenue + last30Days.flowRevenue;
    }

    return NextResponse.json({ totalProfiles, lists, last30Days, metricId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
