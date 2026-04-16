import { NextRequest, NextResponse } from "next/server";
import { klaviyoGet, klaviyoPost, getPlacedOrderMetricId } from "@/lib/klaviyo";

export async function GET(request: NextRequest) {
  try {
    if (!process.env.KLAVIYO_API_KEY) {
      return NextResponse.json({ error: "KLAVIYO_API_KEY not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get("timeframe") ?? "last_365_days";

    const [flowsRes, metricId] = await Promise.all([
      klaviyoGet("/flows/", {
        "sort": "-created",
        "page[size]": "50",
        "fields[flow]": "name,status,created,trigger_type",
      }),
      getPlacedOrderMetricId(),
    ]);

    const flows: Record<string, unknown>[] = flowsRes.data ?? [];

    type FlowAgg = { delivered: number; opens: number; clicks: number; revenue: number; bounced: number; unsubscribed: number; };
    const statsMap: Record<string, FlowAgg> = {};

    if (metricId && flows.length > 0) {
      const statsRes = await klaviyoPost("/flow-values-reports/", {
        data: {
          type: "flow-values-report",
          attributes: {
            timeframe: { key: timeframe },
            conversion_metric_id: metricId,
            statistics: ["opens", "open_rate", "clicks", "click_rate", "delivered", "conversion_value", "bounced", "unsubscribes"],
          },
        },
      });

      for (const r of statsRes?.data?.attributes?.results ?? []) {
        const id = r.groupings?.flow_id;
        if (id) {
          if (!statsMap[id]) statsMap[id] = { delivered: 0, opens: 0, clicks: 0, revenue: 0, bounced: 0, unsubscribed: 0 };
          statsMap[id].delivered    += r.statistics?.delivered ?? 0;
          statsMap[id].opens        += r.statistics?.opens ?? 0;
          statsMap[id].clicks       += r.statistics?.clicks ?? 0;
          statsMap[id].revenue      += r.statistics?.conversion_value ?? 0;
          statsMap[id].bounced      += r.statistics?.bounced ?? 0;
          statsMap[id].unsubscribed += r.statistics?.unsubscribes ?? 0;
        }
      }
    }

    const rows = flows.map((f) => {
      const attrs = f.attributes as Record<string, unknown>;
      const s = statsMap[f.id as string];
      const delivered = s?.delivered ?? null;
      const revenue = s?.revenue ?? null;
      return {
        id: f.id,
        name: attrs?.name ?? "—",
        status: attrs?.status ?? "—",
        triggerType: attrs?.trigger_type ?? null,
        createdAt: attrs?.created ?? null,
        delivered,
        opens: s?.opens ?? null,
        openRate: delivered && delivered > 0 && s?.opens != null ? s.opens / delivered : null,
        clicks: s?.clicks ?? null,
        clickRate: delivered && delivered > 0 && s?.clicks != null ? s.clicks / delivered : null,
        revenue,
        bounced: s?.bounced ?? null,
        bounceRate: delivered && delivered > 0 && s?.bounced != null ? s.bounced / delivered : null,
        unsubscribed: s?.unsubscribed ?? null,
        unsubRate: delivered && delivered > 0 && s?.unsubscribed != null ? s.unsubscribed / delivered : null,
        revenuePerEmail: delivered && delivered > 0 ? (revenue ?? 0) / delivered : null,
      };
    });

    rows.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
    return NextResponse.json({ flows: rows, timeframe });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
