import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";

function hasGCLID(noteAttributes: { name: string; value: string }[]): boolean {
  if (!noteAttributes || noteAttributes.length === 0) return false;
  return noteAttributes.some(
    (attr) => attr.name === "gclid" && attr.value && attr.value.trim() !== ""
  );
}

interface DayBucket {
  date: string;
  totalOrders: number;
  gclidOrders: number;
  totalRevenue: number;
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

    const dailyMap: Record<string, DayBucket> = {};

    let totalOrders = 0;
    let gclidOrders = 0;
    let totalRevenue = 0;
    let gclidRevenue = 0;

    for (const order of orders) {
      const date = order.created_at.substring(0, 10);
      const revenue = parseFloat(order.subtotal_price);
      const isGCLID = hasGCLID(order.note_attributes);

      if (!dailyMap[date]) {
        dailyMap[date] = { date, totalOrders: 0, gclidOrders: 0, totalRevenue: 0, gclidRevenue: 0 };
      }

      dailyMap[date].totalOrders += 1;
      dailyMap[date].totalRevenue += revenue;
      if (isGCLID) {
        dailyMap[date].gclidOrders += 1;
        dailyMap[date].gclidRevenue += revenue;
      }

      totalOrders += 1;
      totalRevenue += revenue;
      if (isGCLID) {
        gclidOrders += 1;
        gclidRevenue += revenue;
      }
    }

    const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    // Roll up to monthly
    const monthMap: Record<string, DayBucket> = {};
    for (const day of daily) {
      const ym = day.date.substring(0, 7);
      if (!monthMap[ym]) {
        monthMap[ym] = { date: ym, totalOrders: 0, gclidOrders: 0, totalRevenue: 0, gclidRevenue: 0 };
      }
      monthMap[ym].totalOrders += day.totalOrders;
      monthMap[ym].gclidOrders += day.gclidOrders;
      monthMap[ym].totalRevenue += day.totalRevenue;
      monthMap[ym].gclidRevenue += day.gclidRevenue;
    }

    const monthly = Object.values(monthMap).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      summary: {
        totalOrders,
        gclidOrders,
        attributionRate: totalOrders > 0 ? gclidOrders / totalOrders : 0,
        totalRevenue,
        gclidRevenue,
      },
      daily,
      monthly,
    }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("gclid error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
