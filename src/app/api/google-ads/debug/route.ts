import { NextResponse } from "next/server";

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

export async function GET() {
  try {
    const accessToken = await getAccessToken();

    // List all accessible customers
    const res = await fetch(
      "https://googleads.googleapis.com/v18/customers:listAccessibleCustomers",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
        },
        cache: "no-store",
      }
    );

    const raw = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }

    return NextResponse.json({
      status: res.status,
      configuredCustomerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
      developerTokenSet: !!(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
      response: parsed,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
