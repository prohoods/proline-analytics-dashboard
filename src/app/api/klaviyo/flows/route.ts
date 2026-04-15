import { NextResponse } from "next/server";
import { klaviyoGet, klaviyoPost, getPlacedOrderMetricId } from "@/lib/klaviyo";

export async function GET() {
  try {
    if (!process.env.KLAVIYO_API_KEY) {
      return NextResponse.json({ error: "KLAVIYO_API_KEY not configured" }, { status: 500 });
    }

    const [flowsRes, metricId] = await Promise.all([
      klaviyoGet("/flows/", {
        "sort": "-created",
        "page[size]": "50",
        "fields[flow]": "name,status,created,trigger_type",
      }),
      getPlacedOrderMetricId(),
    ]);

    const flows: any[] = flowsRes.data ?? [];

    let statsMap: Record<string, any> = {};

    if (metricId && flows.length > 0) {
      const statsRes = await klaviyoPost("/flow-values-reports/", {
        data: {
          type: "flow-values-report",
          attributes: {
            timeframe: { key: "last_365_days" },
            conversion_metric_id: metricId,
            statistics: ["opens", "open_rate", "clicks", "click_rate", "delivered", "revenue", "bounced", "unsubscribed"],
          },
        },
      });

      for (const r of statsRes?.data?.attributes?.results ?? []) {
        const id = r.groupings?.flow_id;
        if (id) {
          // Aggregate across flow messages (multiple entries per flow possible)
          if (!statsMap[id]) {
            statsMap[id] = { delivered: 0, opens: 0, clicks: 0, revenue: 0, bounced: 0, unsubscribed: 0, openRateSum: 0, clickRateSum: 0, count: 0 };
          }
          statsMap[id].delivered += r.statistics?.delivered ?? 0;
          statsMap[id].opens += r.statistics?.opens ?? 0;
          statsMap[id].clicks += r.statistics?.clicks ?? 0;
          statsMap[id].revenue += r.statistics?.revenue ?? 0;
          statsMap[id].bounced += r.statistics?.bounced ?? 0;
          statsMap[id].unsubscribed += r.statistics?.unsubscribed ?? 0;
          if ((r.statistics?.delivered ?? 0) > 0) {
            statsMap[id].openRateSum += r.statistics?.open_rate ?? 0;
            statsMap[id].clickRateSum += r.statistics?.click_rate ?? 0;
            statsMap[id].count++;
          }
        }
      }
    }

    const rows = flows.map((f: any) => {
      const s = statsMap[f.id];
      const delivered = s?.delivered ?? null;
      const revenue = s?.revenue ?? null;
      return {
        id: f.id,
        name: f.attributes?.name ?? "—",
        status: f.attributes?.status ?? "—",
        triggerType: f.attributes?.trigger_type ?? null,
        createdAt: f.attributes?.created ?? null,
        delivered,
        opens: s?.opens ?? null,
        openRate: s?.count > 0 ? s.openRateSum / s.count : null,
        clicks: s?.clicks ?? null,
        clickRate: s?.count > 0 ? s.clickRateSum / s.count : null,
        revenue,
        bounced: s?.bounced ?? null,
        unsubscribed: s?.unsubscribed ?? null,
        revenuePerEmail: delivered && delivered > 0 ? revenue! / delivered : null,
      };
    });

    // Sort by revenue desc
    rows.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));

    return NextResponse.json({ flows: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
