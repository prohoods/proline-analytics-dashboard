import { NextResponse } from "next/server";

const SHOP = "a11c08-ce.myshopify.com";
const CLIENT_ID = process.env.SHL_SHOPIFY_CLIENT_ID!;
const SCOPES = "read_orders,read_analytics,read_customers";
const REDIRECT_URI = "https://proline-analytics-dashboard.vercel.app/api/shopify-shl/callback";

export async function GET() {
  const authUrl =
    `https://${SHOP}/admin/oauth/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=shl-setup`;

  return NextResponse.redirect(authUrl);
}
