import { NextRequest, NextResponse } from "next/server";
import { googleAdsQuery, CampaignRow } from "@/lib/google-ads";

export async function GET(request: NextRequest) {
  try {
    const missingVars = [
      "GOOGLE_ADS_CUSTOMER_ID",
      "GOOGLE_ADS_DEVELOPER_TOKEN",
      "GOOGLE_ADS_CLIENT_ID",
      "GOOGLE_ADS_CLIENT_SECRET",
      "GOOGLE_ADS_REFRESH_TOKEN",
    ].filter((v) => !process.env[v]);

    if (missingVars.length > 0) {
      return NextResponse.json(
        { error: `Missing env vars: ${missingVars.join(", ")}` },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year") ?? new Date().getFullYear().toString();

    // Query monthly campaign performance
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.advertising_channel_sub_type,
        metrics.cost_micros,
        metrics.conversions_value,
        metrics.conversions,
        metrics.impressions,
        metrics.clicks,
        segments.month
      FROM campaign
      WHERE
        segments.date BETWEEN '${year}-01-01' AND '${year}-12-31'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.month DESC, metrics.cost_micros DESC
    `;

    const results = await googleAdsQuery<CampaignRow[]>(query);

    // Group by month and campaign type
    const monthMap: Record<string, {
      month: string;
      totalSpend: number;
      totalConvValue: number;
      totalClicks: number;
      totalImpressions: number;
      campaigns: Record<string, {
        name: string;
        type: string;
        spend: number;
        convValue: number;
        clicks: number;
        impressions: number;
      }>;
    }> = {};

    for (const row of results) {
      const month = row.segments.month.substring(0, 7); // "2026-03"
      const spend = parseInt(row.metrics.costMicros ?? "0") / 1_000_000;
      const convValue = row.metrics.conversionsValue ?? 0;
      const clicks = parseInt(row.metrics.clicks ?? "0");
      const impressions = parseInt(row.metrics.impressions ?? "0");

      // Determine campaign type label
      const channelType = row.campaign.advertisingChannelType;
      const subType = row.campaign.advertisingChannelSubType;
      let type = "Other";
      if (subType === "SHOPPING_SMART_ADS" || subType === "PERFORMANCE_MAX") type = "PMAX";
      else if (channelType === "SHOPPING") type = "Shopping";
      else if (channelType === "SEARCH") type = "Search";
      else if (channelType === "DISPLAY") type = "Display";
      else if (channelType === "VIDEO") type = "Video";

      if (!monthMap[month]) {
        monthMap[month] = { month, totalSpend: 0, totalConvValue: 0, totalClicks: 0, totalImpressions: 0, campaigns: {} };
      }

      monthMap[month].totalSpend += spend;
      monthMap[month].totalConvValue += convValue;
      monthMap[month].totalClicks += clicks;
      monthMap[month].totalImpressions += impressions;

      const campKey = row.campaign.id;
      if (!monthMap[month].campaigns[campKey]) {
        monthMap[month].campaigns[campKey] = {
          name: row.campaign.name,
          type,
          spend: 0,
          convValue: 0,
          clicks: 0,
          impressions: 0,
        };
      }
      monthMap[month].campaigns[campKey].spend += spend;
      monthMap[month].campaigns[campKey].convValue += convValue;
      monthMap[month].campaigns[campKey].clicks += clicks;
      monthMap[month].campaigns[campKey].impressions += impressions;
    }

    const months = Object.values(monthMap)
      .map((m) => ({
        ...m,
        roas: m.totalSpend > 0 ? m.totalConvValue / m.totalSpend : 0,
        campaigns: Object.values(m.campaigns).sort((a, b) => b.spend - a.spend),
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    return NextResponse.json(months, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("google-ads campaigns error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
