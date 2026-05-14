// GA4 Data API client.
// Docs: https://developers.google.com/analytics/devguides/reporting/data/v1
//
// We only need runReport — one call per date range, with the slice of
// dimensions/metrics that maps to `ga4_daily`.

import { getServiceAccountAccessToken } from "./google-service-account";

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

function ga4PropertyId(): string {
  const raw = process.env.GA4_PROPERTY_ID?.trim();
  if (!raw) {
    throw new Error("GA4_PROPERTY_ID env var not set");
  }
  // Accept either "properties/123" or "123" — strip the prefix if present.
  return raw.replace(/^properties\//, "");
}

interface GA4ReportRequest {
  dateRanges: { startDate: string; endDate: string }[];
  dimensions: { name: string }[];
  metrics: { name: string }[];
  limit?: string;
  offset?: string;
}

interface GA4ReportRow {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

interface GA4ReportResponse {
  rows?: GA4ReportRow[];
  rowCount?: number;
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string; type?: string }[];
}

export async function runGA4Report(
  body: GA4ReportRequest
): Promise<GA4ReportResponse> {
  const accessToken = await getServiceAccountAccessToken(GA4_SCOPE);
  const propertyId = ga4PropertyId();
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 Data API ${res.status}: ${err.slice(0, 500)}`);
  }
  return (await res.json()) as GA4ReportResponse;
}

export interface GA4DailyRow {
  date: string; // YYYYMMDD as GA4 returns it
  channel_group: string;
  source: string;
  medium: string;
  campaign: string;
  sessions: number;
  active_users: number;
  engaged_sessions: number;
  conversions: number;
  total_revenue: number;
  bounce_rate: number;
}

// Pulls daily traffic by channel + source/medium + campaign for the given
// window. Paginates via offset/limit — GA4 caps at 100k rows per call,
// well above our daily volume but worth handling.
export async function pullGA4Daily(
  startDate: string,
  endDate: string
): Promise<GA4DailyRow[]> {
  const PAGE = 50_000;
  const rows: GA4DailyRow[] = [];
  let offset = 0;
  for (;;) {
    const data = await runGA4Report({
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: "date" },
        { name: "sessionDefaultChannelGroup" },
        { name: "sessionSource" },
        { name: "sessionMedium" },
        { name: "sessionCampaignName" },
      ],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "engagedSessions" },
        { name: "conversions" },
        { name: "totalRevenue" },
        { name: "bounceRate" },
      ],
      limit: String(PAGE),
      offset: String(offset),
    });
    const batch = data.rows ?? [];
    for (const r of batch) {
      rows.push({
        date: r.dimensionValues[0].value,
        channel_group: r.dimensionValues[1].value,
        source: r.dimensionValues[2].value,
        medium: r.dimensionValues[3].value,
        campaign: r.dimensionValues[4].value,
        sessions: parseInt(r.metricValues[0].value, 10) || 0,
        active_users: parseInt(r.metricValues[1].value, 10) || 0,
        engaged_sessions: parseInt(r.metricValues[2].value, 10) || 0,
        conversions: parseFloat(r.metricValues[3].value) || 0,
        total_revenue: parseFloat(r.metricValues[4].value) || 0,
        bounce_rate: parseFloat(r.metricValues[5].value) || 0,
      });
    }
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}
