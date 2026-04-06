// Google Ads API client using OAuth2
// Docs: https://developers.google.com/google-ads/api/docs/rest/overview

const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID ?? "";
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";
const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET ?? "";
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "";

const API_VERSION = "v20";

// Get a fresh access token using the refresh token
async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get Google access token: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Run a GAQL query against the Google Ads API
export async function googleAdsQuery<T = Record<string, unknown>[]>(
  query: string
): Promise<T> {
  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${CUSTOMER_ID}/googleAds:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": DEVELOPER_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Ads API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return (data.results ?? []) as T;
}

export interface CampaignRow {
  campaign: {
    id: string;
    name: string;
    status: string;
    advertisingChannelType: string;
    advertisingChannelSubType: string;
  };
  metrics: {
    costMicros: string;
    conversionsValue: number;
    conversions: number;
    impressions: string;
    clicks: string;
  };
  segments: {
    month: string;
  };
}
