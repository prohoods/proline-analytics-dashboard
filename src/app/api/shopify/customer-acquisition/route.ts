import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";

// orders_count on the customer object is their lifetime total.
// orders_count === 1  → this is their only ever order = new customer
// orders_count > 1   → they have ordered before or after = repeat customer
// no customer object → guest checkout

interface MonthBucket {
  month: string;
  newCustomers: number;
  repeatCustomers: number;
  guestOrders: number;
  newRevenue: number;
  repeatRevenue: number;
  guestRevenue: number;
  gclidNew: number;       // new customers who came via Google click
  gclidRevenue: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00`;
    const { orders } = await getOrders(params);

    let totalNewCustomers = 0;
    let totalRepeat = 0;
    let totalGuest = 0;
    let newRevenue = 0;
    let repeatRevenue = 0;
    let guestRevenue = 0;
    let gclidNewCount = 0;
    let gclidNewRevenue = 0;

    const monthMap: Record<string, MonthBucket> = {};

    for (const order of orders) {
      const month = order.created_at.substring(0, 7);
      const revenue = parseFloat(order.subtotal_price);
      const isGCLID = (order.note_attributes ?? []).some(
        a => a.name === "gclid" && a.value?.trim()
      );

      if (!monthMap[month]) {
        monthMap[month] = {
          month, newCustomers: 0, repeatCustomers: 0, guestOrders: 0,
          newRevenue: 0, repeatRevenue: 0, guestRevenue: 0,
          gclidNew: 0, gclidRevenue: 0,
        };
      }

      if (!order.customer) {
        totalGuest++;
        guestRevenue += revenue;
        monthMap[month].guestOrders++;
        monthMap[month].guestRevenue += revenue;
      } else if ((order.customer.orders_count ?? 1) <= 1) {
        // orders_count of 1 means this is their only order = new customer
        totalNewCustomers++;
        newRevenue += revenue;
        monthMap[month].newCustomers++;
        monthMap[month].newRevenue += revenue;
        if (isGCLID) {
          gclidNewCount++;
          gclidNewRevenue += revenue;
          monthMap[month].gclidNew++;
          monthMap[month].gclidRevenue += revenue;
        }
      } else {
        totalRepeat++;
        repeatRevenue += revenue;
        monthMap[month].repeatCustomers++;
        monthMap[month].repeatRevenue += revenue;
      }
    }

    const totalWithAccount = totalNewCustomers + totalRepeat;
    const totalOrders = orders.length;

    const monthly = Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month));

    return NextResponse.json({
      summary: {
        totalOrders,
        newCustomers: totalNewCustomers,
        repeatCustomers: totalRepeat,
        guestOrders: totalGuest,
        repeatRate: totalWithAccount > 0 ? totalRepeat / totalWithAccount : 0,
        newRevenue,
        repeatRevenue,
        guestRevenue,
        gclidNewCount,
        gclidNewRevenue,
      },
      monthly,
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("customer-acquisition error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
