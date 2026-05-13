// Pulls click_view rows from Google Ads (one query per day) and upserts into
// google_ads_clicks. Lets us measure capture rate vs the truth Google reports.
//
// Usage: POST /api/google-ads/import-clicks?days=30
// click_view only goes back 90 days, so days is clamped to [1, 90].

import { NextRequest, NextResponse } from "next/server";
import {
  API_VERSION,
  GOOGLE_ADS_CUSTOMER_ID,
  GOOGLE_ADS_DEVELOPER_TOKEN,
  getAccessToken,
} from "@/lib/google-ads";
import { getSql } from "@/lib/db";

interface ClickRow {
  clickView?: { gclid?: string };
  campaign?: { id?: string; name?: string };
  adGroup?: { id?: string; name?: string };
  segments?: { date?: string; device?: string; adNetworkType?: string };
}

interface SearchResponse {
  results?: ClickRow[];
  nextPageToken?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchClicksForDay(
  date: string,
  accessToken: string
): Promise<ClickRow[]> {
  const out: ClickRow[] = [];
  let pageToken: string | undefined = undefined;
  const query = `
    SELECT
      click_view.gclid,
      segments.date,
      segments.device,
      segments.ad_network_type,
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name
    FROM click_view
    WHERE segments.date = '${date}'
  `;

  do {
    const body: Record<string, unknown> = { query, pageSize: 10000 };
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`click_view ${date} ${res.status}: ${text}`);
    }
    const data = JSON.parse(text) as SearchResponse;
    for (const r of data.results ?? []) out.push(r);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return out;
}

export async function POST(req: NextRequest) {
  if (!GOOGLE_ADS_CUSTOMER_ID || !GOOGLE_ADS_DEVELOPER_TOKEN) {
    return NextResponse.json(
      { ok: false, error: "Google Ads env vars not set" },
      { status: 500 }
    );
  }

  const days = Math.max(
    1,
    Math.min(90, Number(req.nextUrl.searchParams.get("days") ?? "30"))
  );

  try {
    const sql = getSql();
    const accessToken = await getAccessToken();

    let totalFetched = 0;
    let totalUpserted = 0;
    const perDay: Record<string, number> = {};

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const date = isoDate(d);

      const rows = await fetchClicksForDay(date, accessToken);
      totalFetched += rows.length;
      perDay[date] = rows.length;

      for (const r of rows) {
        const gclid = r.clickView?.gclid;
        if (!gclid) continue;
        await sql`
          insert into google_ads_clicks (
            gclid, click_date, campaign_id, campaign_name,
            ad_group_id, ad_group_name, device, ad_network_type
          ) values (
            ${gclid}, ${r.segments?.date ?? date},
            ${r.campaign?.id ?? null}, ${r.campaign?.name ?? null},
            ${r.adGroup?.id ?? null}, ${r.adGroup?.name ?? null},
            ${r.segments?.device ?? null}, ${r.segments?.adNetworkType ?? null}
          )
          on conflict (gclid) do update set
            click_date = excluded.click_date,
            campaign_id = coalesce(excluded.campaign_id, google_ads_clicks.campaign_id),
            campaign_name = coalesce(excluded.campaign_name, google_ads_clicks.campaign_name),
            ad_group_id = coalesce(excluded.ad_group_id, google_ads_clicks.ad_group_id),
            ad_group_name = coalesce(excluded.ad_group_name, google_ads_clicks.ad_group_name),
            device = coalesce(excluded.device, google_ads_clicks.device),
            ad_network_type = coalesce(excluded.ad_network_type, google_ads_clicks.ad_network_type)
        `;
        totalUpserted++;
      }
    }

    const [{ total }] = await sql<{ total: number }[]>`
      select count(*)::int as total from google_ads_clicks
    `;

    return NextResponse.json({
      ok: true,
      window: { days },
      totalFetched,
      totalUpserted,
      tableTotal: total,
      perDay,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
