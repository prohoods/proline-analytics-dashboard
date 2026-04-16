import { NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";

// Fetches 15 months of orders to build:
// 1. Monthly cohort retention matrix (first-time buyers who came back)
// 2. Win-back segments (customers inactive 90 / 180 / 365+ days)
// 3. Time-to-second-purchase stats

export async function GET() {
  try {
    const today = new Date();
    const end = today.toISOString().substring(0, 10);
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - 15);
    const start = startDate.toISOString().substring(0, 10);

    const params = `created_at_min=${start}T00:00:00-07:00&created_at_max=${end}T23:59:59-07:00`;
    const { orders } = await getOrders(params);

    // Group orders by customer email
    const byCustomer: Record<string, { dates: string[]; revenue: number[] }> = {};
    for (const order of orders) {
      const email = order.customer?.email;
      if (!email) continue;
      if (!byCustomer[email]) byCustomer[email] = { dates: [], revenue: [] };
      byCustomer[email].dates.push(order.created_at.substring(0, 10));
      byCustomer[email].revenue.push(parseFloat(order.total_price ?? "0"));
    }

    // Sort each customer's orders by date ascending
    for (const c of Object.values(byCustomer)) {
      const combined = c.dates.map((d, i) => ({ d, r: c.revenue[i] })).sort((a, b) => a.d.localeCompare(b.d));
      c.dates = combined.map(x => x.d);
      c.revenue = combined.map(x => x.r);
    }

    // ── Cohort retention matrix ──────────────────────────────────────────────
    // Build month list from start to today
    const months: string[] = [];
    const cur = new Date(startDate);
    cur.setDate(1);
    while (cur <= today) {
      months.push(cur.toISOString().substring(0, 7));
      cur.setMonth(cur.getMonth() + 1);
    }

    // Map customer → first-order month (within our window)
    const cohortMap: Record<string, { cohortMonth: string; email: string; allDates: string[] }> = {};
    for (const [email, { dates }] of Object.entries(byCustomer)) {
      cohortMap[email] = { cohortMonth: dates[0].substring(0, 7), email, allDates: dates };
    }

    // For each cohort month, count size and how many returned in M+N
    const cohortRows: { cohortMonth: string; size: number; retention: (number | null)[] }[] = [];
    const MAX_OFFSET = 6; // show up to 6 months of retention

    for (const cm of months.slice(0, -1)) { // exclude current partial month
      const cohortCustomers = Object.values(cohortMap).filter(c => c.cohortMonth === cm);
      if (cohortCustomers.length === 0) continue;

      const retention: (number | null)[] = [];
      for (let offset = 0; offset <= MAX_OFFSET; offset++) {
        const targetDate = new Date(cm + "-01");
        targetDate.setMonth(targetDate.getMonth() + offset);
        const targetMonth = targetDate.toISOString().substring(0, 7);

        // Don't show future months
        if (targetMonth > today.toISOString().substring(0, 7)) {
          retention.push(null);
          continue;
        }

        if (offset === 0) {
          retention.push(cohortCustomers.length); // 100% by definition (M+0 = acquisition month)
        } else {
          const returned = cohortCustomers.filter(c =>
            c.allDates.some(d => d.startsWith(targetMonth))
          ).length;
          retention.push(returned);
        }
      }

      cohortRows.push({ cohortMonth: cm, size: cohortCustomers.length, retention });
    }

    // ── Win-back segments ────────────────────────────────────────────────────
    const todayStr = today.toISOString().substring(0, 10);
    const d90 = new Date(today); d90.setDate(d90.getDate() - 90);
    const d180 = new Date(today); d180.setDate(d180.getDate() - 180);
    const d365 = new Date(today); d365.setDate(d365.getDate() - 365);

    const winback = {
      d90:  { label: "90–179 days",  count: 0, totalRevenue: 0 },
      d180: { label: "180–364 days", count: 0, totalRevenue: 0 },
      d365: { label: "365+ days",    count: 0, totalRevenue: 0 },
    };

    for (const { dates, revenue } of Object.values(byCustomer)) {
      const lastOrder = dates[dates.length - 1];
      const daysSince = Math.floor((new Date(todayStr).getTime() - new Date(lastOrder).getTime()) / 86400000);
      const totalRev = revenue.reduce((s, r) => s + r, 0);

      if (daysSince >= 365) {
        winback.d365.count++;
        winback.d365.totalRevenue += totalRev;
      } else if (daysSince >= 180) {
        winback.d180.count++;
        winback.d180.totalRevenue += totalRev;
      } else if (daysSince >= 90) {
        winback.d90.count++;
        winback.d90.totalRevenue += totalRev;
      }
    }

    // ── Time to second purchase ──────────────────────────────────────────────
    const gaps: number[] = [];
    for (const { dates } of Object.values(byCustomer)) {
      if (dates.length >= 2) {
        const first = new Date(dates[0]).getTime();
        const second = new Date(dates[1]).getTime();
        gaps.push(Math.floor((second - first) / 86400000));
      }
    }
    gaps.sort((a, b) => a - b);
    const avgDays = gaps.length > 0 ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;
    const medianDays = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : null;

    return NextResponse.json({
      cohorts: cohortRows.slice(-12).reverse(), // most recent first, max 12 rows
      winback: Object.values(winback),
      timeToSecond: { avg: avgDays, median: medianDays, count: gaps.length },
    }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
