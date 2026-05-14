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

export const maxDuration = 300;

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
    const body: Record<string, unknown> = { query };
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

      // Build a deduped batch — Google Ads can return the same gclid twice
      // (e.g. impressions on multiple ad networks), and ON CONFLICT can't
      // resolve dupes inside a single multi-row INSERT.
      const seen = new Set<string>();
      const batch = rows
        .map((r) => {
          const gclid = r.clickView?.gclid;
          if (!gclid || seen.has(gclid)) return null;
          seen.add(gclid);
          return {
            gclid,
            click_date: r.segments?.date ?? date,
            campaign_id: r.campaign?.id ?? null,
            campaign_name: r.campaign?.name ?? null,
            ad_group_id: r.adGroup?.id ?? null,
            ad_group_name: r.adGroup?.name ?? null,
            device: r.segments?.device ?? null,
            ad_network_type: r.segments?.adNetworkType ?? null,
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

      if (batch.length === 0) continue;

      // Postgres caps bind parameters at 65,534 per statement. 8 cols × N rows
      // means we need to chunk at ~4,000 rows to stay well under the limit.
      const CHUNK = 4000;
      for (let off = 0; off < batch.length; off += CHUNK) {
        const slice = batch.slice(off, off + CHUNK);
        await sql`
          insert into google_ads_clicks ${sql(
            slice,
            "gclid",
            "click_date",
            "campaign_id",
            "campaign_name",
            "ad_group_id",
            "ad_group_name",
            "device",
            "ad_network_type"
          )}
          on conflict (gclid) do update set
            click_date = excluded.click_date,
            campaign_id = coalesce(excluded.campaign_id, google_ads_clicks.campaign_id),
            campaign_name = coalesce(excluded.campaign_name, google_ads_clicks.campaign_name),
            ad_group_id = coalesce(excluded.ad_group_id, google_ads_clicks.ad_group_id),
            ad_group_name = coalesce(excluded.ad_group_name, google_ads_clicks.ad_group_name),
            device = coalesce(excluded.device, google_ads_clicks.device),
            ad_network_type = coalesce(excluded.ad_network_type, google_ads_clicks.ad_network_type)
        `;
      }
      totalUpserted += batch.length;
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
