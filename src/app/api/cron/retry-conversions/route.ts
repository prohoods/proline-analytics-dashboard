// Cron entry that calls the retry endpoint. Wired up in vercel.json.
// Runs at :15 past every hour.
//
// Vercel auto-authenticates cron requests via the `CRON_SECRET` env var;
// the middleware allowlists /api/cron/* so this fires without user auth.

import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET() {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const url = `${base}/api/conversions/retry?lookbackHours=168&max=200`;
  const res = await fetch(url, { method: "POST", cache: "no-store" });
  const body = await res.json();
  return NextResponse.json({ triggered: url, ...body });
}
