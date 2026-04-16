import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";

function classifyChannel(landingSite: string | null, referringSite: string | null, noteAttributes: { name: string; value: string }[], sourceName: string): string {
  const hasGclid = noteAttributes.some(a => a.name === "gclid" && a.value?.trim());
  if (hasGclid) return "Google Ads";
  if (landingSite) {
    try {
      const url = new URL(landingSite.startsWith("http") ? landingSite : `https://x.com${landingSite}`);
      const src = url.searchParams.get("utm_source")?.toLowerCase() ?? "";
      const med = url.searchParams.get("utm_medium")?.toLowerCase() ?? "";
      if (src.includes("google")) return "Google Ads";
      if (src.includes("bing") || src.includes("microsoft")) return "Bing Ads";
      if (src.includes("facebook") || src.includes("meta")) return "Meta";
      if (src.includes("klaviyo") || med.includes("email")) return "Email";
      if (src.includes("pinterest")) return "Pinterest";
      if (src) return src.charAt(0).toUpperCase() + src.slice(1);
    } catch { /* ignore */ }
  }
  const ref = (referringSite ?? "").toLowerCase();
  if (ref.includes("google")) return "Google Organic";
  if (ref.includes("bing")) return "Bing Organic";
  if (sourceName === "pos") return "POS";
  return "Direct";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (!start || !end) return NextResponse.json({ error: "start and end required" }, { status: 400 });

    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00&financial_status=any`;
    const { orders } = await getOrders(params);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    type CustomerRecord = {
      id: number; name: string; email: string;
      orderCount: number; totalSpend: number;
      firstOrder: string; lastOrder: string; daysSinceLastOrder: number;
      state: string | null; stateCode: string | null;
      channel: string; isProlinePro: boolean;
      recentOrders: { date: string; amount: number; orderName: string }[];
    };

    const customerMap: Record<number, CustomerRecord> = {};
    let guestOrders = 0;
    let guestRevenue = 0;
    let totalRevenue = 0;

    for (const order of orders) {
      const amount = parseFloat(order.total_price ?? "0");
      totalRevenue += amount;

      if (!order.customer) { guestOrders++; guestRevenue += amount; continue; }

      const cid = order.customer.id as unknown as number;
      // Shopify returns customer.id as a number; cast safely
      const customerId = typeof cid === "number" ? cid : parseInt(String(cid));
      const isProlinePro = order.tags?.includes("ProlinePro B2B") ?? false;
      const state = order.billing_address?.province ?? null;
      const stateCode = order.billing_address?.province_code ?? null;
      const channel = classifyChannel(order.landing_site, order.referring_site, order.note_attributes ?? [], order.source_name);

      if (!customerMap[customerId]) {
        customerMap[customerId] = {
          id: customerId,
          name: `${order.customer.first_name} ${order.customer.last_name}`.trim(),
          email: order.customer.email ?? "",
          orderCount: 0, totalSpend: 0,
          firstOrder: order.created_at.substring(0, 10),
          lastOrder: order.created_at.substring(0, 10),
          daysSinceLastOrder: 0,
          state, stateCode, channel, isProlinePro,
          recentOrders: [],
        };
      }

      const c = customerMap[customerId];
      c.orderCount++;
      c.totalSpend += amount;
      if (order.created_at.substring(0, 10) < c.firstOrder) c.firstOrder = order.created_at.substring(0, 10);
      if (order.created_at.substring(0, 10) > c.lastOrder) {
        c.lastOrder = order.created_at.substring(0, 10);
        c.state = state;
        c.stateCode = stateCode;
        c.channel = channel;
      }
      if (isProlinePro) c.isProlinePro = true;
      if (c.recentOrders.length < 10) {
        c.recentOrders.push({ date: order.created_at.substring(0, 10), amount, orderName: order.name });
      }
    }

    const customers = Object.values(customerMap).map(c => {
      const lastDate = new Date(c.lastOrder);
      const days = Math.floor((today.getTime() - lastDate.getTime()) / 86400000);
      return { ...c, daysSinceLastOrder: days };
    }).sort((a, b) => b.totalSpend - a.totalSpend);

    const repeatCustomers = customers.filter(c => c.orderCount > 1);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    const repeatRate = customers.length > 0 ? (repeatCustomers.length / customers.length) * 100 : 0;

    return NextResponse.json({
      summary: {
        totalOrders: orders.length,
        uniqueCustomers: customers.length,
        repeatCustomers: repeatCustomers.length,
        repeatRate: Math.round(repeatRate * 10) / 10,
        avgOrderValue,
        guestOrders,
        guestRevenue,
        totalRevenue,
      },
      customers,
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
