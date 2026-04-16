import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";

// orders_count === 1  → new customer (only ever placed this one order)
// orders_count > 1   → repeat customer
// no customer object → guest checkout
// tag "ProlinePro B2B" → always repeat, regardless of orders_count

interface MonthBucket {
  month: string;
  newCustomers: number;
  repeatCustomers: number;
  guestOrders: number;
  newRevenue: number;
  repeatRevenue: number;
  guestRevenue: number;
  gclidNew: number;
  gclidRevenue: number;
  aov: number;
}

function parseUtmSource(landingSite: string | null): string | null {
  if (!landingSite) return null;
  try {
    const url = new URL(landingSite.startsWith("http") ? landingSite : `https://x.com${landingSite}`);
    const src = url.searchParams.get("utm_source");
    const med = url.searchParams.get("utm_medium");
    if (src) return med ? `${src} / ${med}` : src;
  } catch { /* ignore */ }
  return null;
}

function classifyChannel(order: { note_attributes: { name: string; value: string }[]; landing_site: string | null; referring_site: string | null; source_name: string }): string {
  const hasGclid = (order.note_attributes ?? []).some(a => a.name === "gclid" && a.value?.trim());
  if (hasGclid) return "Google Ads";

  const utm = parseUtmSource(order.landing_site);
  if (utm) {
    const lower = utm.toLowerCase();
    if (lower.includes("google")) return "Google Ads";
    if (lower.includes("bing") || lower.includes("microsoft")) return "Bing Ads";
    if (lower.includes("facebook") || lower.includes("meta") || lower.includes("ig")) return "Meta / Facebook";
    if (lower.includes("klaviyo") || lower.includes("email")) return "Email";
    if (lower.includes("pinterest")) return "Pinterest";
    return utm;
  }

  const ref = (order.referring_site ?? "").toLowerCase();
  if (ref.includes("google")) return "Google Organic";
  if (ref.includes("bing")) return "Bing Organic";

  if (order.source_name === "pos") return "POS / In-Store";
  if (order.source_name === "iphone" || order.source_name === "android") return "Mobile App";

  return "Direct / Unknown";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (!start || !end) return NextResponse.json({ error: "start and end required" }, { status: 400 });

    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00`;
    const { orders } = await getOrders(params);

    let totalNew = 0, totalRepeat = 0, totalGuest = 0;
    let newRevenue = 0, repeatRevenue = 0, guestRevenue = 0;
    let gclidNewCount = 0, gclidNewRevenue = 0;

    const monthMap: Record<string, MonthBucket> = {};
    const geoMap: Record<string, { state: string; code: string; orders: number; revenue: number; newCustomers: number; repeatCustomers: number }> = {};
    const tierMap: Record<string, { label: string; min: number; max: number; count: number; revenue: number }> = {
      "0-500":    { label: "$0 – $500",      min: 0,    max: 500,    count: 0, revenue: 0 },
      "500-1000": { label: "$500 – $1,000",  min: 500,  max: 1000,   count: 0, revenue: 0 },
      "1000-2000":{ label: "$1,000 – $2,000",min: 1000, max: 2000,   count: 0, revenue: 0 },
      "2000+":    { label: "$2,000+",         min: 2000, max: Infinity,count: 0, revenue: 0 },
    };
    const channelMap: Record<string, { source: string; orders: number; revenue: number; newCustomers: number }> = {};

    for (const order of orders) {
      const month = order.created_at.substring(0, 7);
      const revenue = parseFloat(order.subtotal_price ?? order.total_price ?? "0");
      const isProlinePro = order.tags?.includes("ProlinePro B2B");
      const isGCLID = (order.note_attributes ?? []).some(a => a.name === "gclid" && a.value?.trim());

      if (!monthMap[month]) {
        monthMap[month] = { month, newCustomers: 0, repeatCustomers: 0, guestOrders: 0, newRevenue: 0, repeatRevenue: 0, guestRevenue: 0, gclidNew: 0, gclidRevenue: 0, aov: 0 };
      }

      // Classify customer type
      let type: "new" | "repeat" | "guest";
      if (!order.customer) {
        type = "guest";
      } else if (isProlinePro || (order.customer.orders_count ?? 1) > 1) {
        type = "repeat";
      } else {
        type = "new";
      }

      if (type === "guest") {
        totalGuest++;
        guestRevenue += revenue;
        monthMap[month].guestOrders++;
        monthMap[month].guestRevenue += revenue;
      } else if (type === "repeat") {
        totalRepeat++;
        repeatRevenue += revenue;
        monthMap[month].repeatCustomers++;
        monthMap[month].repeatRevenue += revenue;
      } else {
        totalNew++;
        newRevenue += revenue;
        monthMap[month].newCustomers++;
        monthMap[month].newRevenue += revenue;
        if (isGCLID) {
          gclidNewCount++;
          gclidNewRevenue += revenue;
          monthMap[month].gclidNew++;
          monthMap[month].gclidRevenue += revenue;
        }
      }

      // Geographic
      const addr = order.billing_address;
      if (addr?.province) {
        const key = addr.province_code || addr.province;
        if (!geoMap[key]) geoMap[key] = { state: addr.province, code: key, orders: 0, revenue: 0, newCustomers: 0, repeatCustomers: 0 };
        geoMap[key].orders++;
        geoMap[key].revenue += revenue;
        if (type === "new") geoMap[key].newCustomers++;
        if (type === "repeat") geoMap[key].repeatCustomers++;
      }

      // Value tiers (using total_price for the full order value)
      const orderValue = parseFloat(order.total_price ?? "0");
      const tierKey = orderValue >= 2000 ? "2000+" : orderValue >= 1000 ? "1000-2000" : orderValue >= 500 ? "500-1000" : "0-500";
      tierMap[tierKey].count++;
      tierMap[tierKey].revenue += orderValue;

      // Channel attribution
      const channel = classifyChannel(order);
      if (!channelMap[channel]) channelMap[channel] = { source: channel, orders: 0, revenue: 0, newCustomers: 0 };
      channelMap[channel].orders++;
      channelMap[channel].revenue += revenue;
      if (type === "new") channelMap[channel].newCustomers++;
    }

    // Compute AOV per month
    const monthly = Object.values(monthMap)
      .sort((a, b) => b.month.localeCompare(a.month))
      .map(m => {
        const totalOrders = m.newCustomers + m.repeatCustomers + m.guestOrders;
        return { ...m, aov: totalOrders > 0 ? (m.newRevenue + m.repeatRevenue + m.guestRevenue) / totalOrders : 0 };
      });

    const totalOrders = orders.length;
    const totalWithAccount = totalNew + totalRepeat;
    const aovNew = totalNew > 0 ? newRevenue / totalNew : 0;
    const aovRepeat = totalRepeat > 0 ? repeatRevenue / totalRepeat : 0;
    const aovGuest = totalGuest > 0 ? guestRevenue / totalGuest : 0;
    const aovAll = totalOrders > 0 ? (newRevenue + repeatRevenue + guestRevenue) / totalOrders : 0;

    const geographic = Object.values(geoMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    const valueTiers = Object.values(tierMap);

    const channels = Object.values(channelMap)
      .sort((a, b) => b.orders - a.orders);

    return NextResponse.json({
      summary: {
        totalOrders, newCustomers: totalNew, repeatCustomers: totalRepeat, guestOrders: totalGuest,
        repeatRate: totalWithAccount > 0 ? totalRepeat / totalWithAccount : 0,
        newRevenue, repeatRevenue, guestRevenue,
        gclidNewCount, gclidNewRevenue,
        aovNew, aovRepeat, aovGuest, aovAll,
      },
      monthly,
      geographic,
      valueTiers,
      channels,
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
