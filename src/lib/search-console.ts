// Search Console API client.
// Docs: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
//
// Returns query-level performance — clicks, impressions, ctr, position.
// We slice by (date, query) only; adding page/device/country here would
// blow up row count for marginal value.

import { getServiceAccountAccessToken } from "./google-service-account";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

function siteUrl(): string {
  const raw = process.env.SEARCH_CONSOLE_SITE_URL?.trim();
  if (!raw) throw new Error("SEARCH_CONSOLE_SITE_URL env var not set");
  return raw;
}

interface GSCQueryBody {
  startDate: string;
  endDate: string;
  dimensions: ("date" | "query" | "page" | "country" | "device")[];
  rowLimit?: number;
  startRow?: number;
  dataState?: "all" | "final";
}

interface GSCRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GSCResponse {
  rows?: GSCRow[];
  responseAggregationType?: string;
}

async function runGSCQuery(body: GSCQueryBody): Promise<GSCResponse> {
  const accessToken = await getServiceAccountAccessToken(GSC_SCOPE);
  const encodedSite = encodeURIComponent(siteUrl());
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
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
    throw new Error(`Search Console API ${res.status}: ${err.slice(0, 500)}`);
  }
  return (await res.json()) as GSCResponse;
}

export interface GSCDailyRow {
  date: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// Pulls (date, query) breakdown for the window. GSC paginates at 25k rows
// per call; we walk startRow until we get a short page.
export async function pullSearchConsoleDaily(
  startDate: string,
  endDate: string
): Promise<GSCDailyRow[]> {
  const PAGE = 25_000;
  const rows: GSCDailyRow[] = [];
  let startRow = 0;
  for (;;) {
    const data = await runGSCQuery({
      startDate,
      endDate,
      dimensions: ["date", "query"],
      rowLimit: PAGE,
      startRow,
      dataState: "all",
    });
    const batch = data.rows ?? [];
    for (const r of batch) {
      rows.push({
        date: r.keys[0],
        query: r.keys[1],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      });
    }
    if (batch.length < PAGE) break;
    startRow += PAGE;
  }
  return rows;
}
