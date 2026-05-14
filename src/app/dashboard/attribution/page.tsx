// Capture-rate dashboard. Compares shopify_orders against google_ads_clicks
// to measure how many Google-Ads-sourced orders carry a GCLID we recognize.
//
// Definitions:
//   captured           = order has a GCLID in note_attributes
//   verified           = captured AND gclid exists in google_ads_clicks
//   capture rate       = verified / orders-from-google (proxy: utm_source includes google)
//   click-match rate   = verified / captured  (sanity check on our capture quality)

import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

interface DailyRow {
  day: string;
  orders: number;
  with_gclid: number;
  verified: number;
  google_source: number;
}

interface OrderRow {
  id: string;
  order_number: string | null;
  ordered_at: Date;
  total: string | null;
  currency: string | null;
  gclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  is_new_customer: boolean | null;
  click_matched: boolean;
}

interface CampaignRow {
  campaign_name: string | null;
  orders: number;
  total_value: string | null;
}

async function loadData() {
  const sql = getSql();
  try {
    const [daily, recent, campaigns, totals, clickTotal] = await Promise.all([
      sql<DailyRow[]>`
        select
          to_char(date_trunc('day', ordered_at), 'YYYY-MM-DD') as day,
          count(*)::int as orders,
          count(*) filter (where gclid is not null)::int as with_gclid,
          count(*) filter (
            where gclid is not null
              and exists (select 1 from google_ads_clicks gac where gac.gclid = shopify_orders.gclid)
          )::int as verified,
          count(*) filter (where lower(coalesce(utm_source, '')) like '%google%')::int as google_source
        from shopify_orders
        where ordered_at >= now() - interval '30 days'
        group by 1
        order by 1 desc
      `,
      sql<OrderRow[]>`
        select
          so.id::text,
          so.order_number,
          so.ordered_at,
          so.total::text,
          so.currency,
          so.gclid,
          so.utm_source,
          so.utm_medium,
          so.utm_campaign,
          so.is_new_customer,
          (so.gclid is not null and gac.gclid is not null) as click_matched
        from shopify_orders so
        left join google_ads_clicks gac on gac.gclid = so.gclid
        order by so.ordered_at desc
        limit 100
      `,
      sql<CampaignRow[]>`
        select
          gac.campaign_name,
          count(*)::int as orders,
          sum(so.total)::text as total_value
        from shopify_orders so
        join google_ads_clicks gac on gac.gclid = so.gclid
        where so.ordered_at >= now() - interval '30 days'
        group by gac.campaign_name
        order by orders desc
        limit 20
      `,
      sql<
        {
          orders: number;
          with_gclid: number;
          verified: number;
          google_source: number;
          new_customers: number;
        }[]
      >`
        select
          count(*)::int as orders,
          count(*) filter (where gclid is not null)::int as with_gclid,
          count(*) filter (
            where gclid is not null
              and exists (select 1 from google_ads_clicks gac where gac.gclid = shopify_orders.gclid)
          )::int as verified,
          count(*) filter (where lower(coalesce(utm_source, '')) like '%google%')::int as google_source,
          count(*) filter (where is_new_customer is true)::int as new_customers
        from shopify_orders
        where ordered_at >= now() - interval '30 days'
      `,
      sql<{ total: number }[]>`select count(*)::int as total from google_ads_clicks`,
    ]);
    return {
      daily,
      recent,
      campaigns,
      totals: totals[0] ?? {
        orders: 0,
        with_gclid: 0,
        verified: 0,
        google_source: 0,
        new_customers: 0,
      },
      clickTotal: clickTotal[0]?.total ?? 0,
      error: null as string | null,
    };
  } catch (e) {
    return {
      daily: [] as DailyRow[],
      recent: [] as OrderRow[],
      campaigns: [] as CampaignRow[],
      totals: { orders: 0, with_gclid: 0, verified: 0, google_source: 0, new_customers: 0 },
      clickTotal: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function fmtMoney(v: string | null, currency: string | null) {
  if (v === null) return "—";
  const n = parseFloat(v);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AttributionPage() {
  const { daily, recent, campaigns, totals, clickTotal, error } = await loadData();
  // "Match quality" = how many of the GCLIDs we captured actually correspond
  // to real Google clicks. This is the trustworthy metric.
  // (utm_source=google is too unreliable as a denominator — Performance Max,
  // Shopping, etc rarely set it, so verified/utm-google often exceeds 100%.)
  const matchQuality = pct(totals.verified, totals.with_gclid);
  const gclidShare = pct(totals.with_gclid, totals.orders);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">GCLID Capture & Attribution</h1>
        <p className="text-sm text-gray-400 mt-1">
          Joins <code className="text-gray-300">shopify_orders</code> against{" "}
          <code className="text-gray-300">google_ads_clicks</code> to measure how many
          paid clicks convert to orders with the GCLID intact.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-700 bg-red-900/20 text-red-200 text-sm">
          <div className="font-semibold">Database error</div>
          <div className="mt-1 text-red-300">{error}</div>
          <div className="mt-2 text-xs text-red-300">
            Make sure migrations 006 and 007 are applied:{" "}
            <code className="px-1.5 py-0.5 rounded bg-black/40">POST /api/conversions/migrate</code>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Stat label="Orders (30d)" value={totals.orders.toString()} />
        <Stat
          label="With GCLID"
          value={totals.with_gclid.toString()}
          sub={gclidShare}
          accent="text-blue-300"
        />
        <Stat
          label="Verified vs click_view"
          value={totals.verified.toString()}
          sub={`${totals.verified} / ${totals.with_gclid}`}
          accent="text-emerald-400"
        />
        <Stat
          label="Match quality"
          value={matchQuality}
          sub="verified ÷ captured"
          accent={
            totals.with_gclid > 0 && totals.verified / totals.with_gclid >= 0.9
              ? "text-emerald-400"
              : "text-amber-400"
          }
        />
        <Stat
          label="From Google (utm)"
          value={totals.google_source.toString()}
          sub={`unreliable proxy`}
        />
      </div>

      <div className="mb-6 text-xs text-gray-500">
        <span className="mr-4">
          <span className="text-gray-400">click_view rows in DB:</span> {clickTotal.toLocaleString()}
        </span>
        <span>
          <span className="text-gray-400">new customers (30d):</span> {totals.new_customers}
        </span>
      </div>

      <Section title="Daily breakdown (last 30d)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs uppercase tracking-wider">
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2">Day</th>
                <th className="text-right px-4 py-2">Orders</th>
                <th className="text-right px-4 py-2">From Google</th>
                <th className="text-right px-4 py-2">GCLID captured</th>
                <th className="text-right px-4 py-2">Verified</th>
                <th className="text-right px-4 py-2">Capture rate</th>
              </tr>
            </thead>
            <tbody>
              {daily.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500 text-sm">
                    No orders yet. Rows will populate as webhooks fire.
                  </td>
                </tr>
              )}
              {daily.map((d) => (
                <tr key={d.day} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{d.day}</td>
                  <td className="px-4 py-2 text-right text-gray-200">{d.orders}</td>
                  <td className="px-4 py-2 text-right text-gray-300">{d.google_source}</td>
                  <td className="px-4 py-2 text-right text-blue-300">{d.with_gclid}</td>
                  <td className="px-4 py-2 text-right text-emerald-300">{d.verified}</td>
                  <td className="px-4 py-2 text-right text-gray-200">
                    {pct(d.verified, d.with_gclid)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Top campaigns (orders matched via GCLID, 30d)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs uppercase tracking-wider">
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2">Campaign</th>
                <th className="text-right px-4 py-2">Orders</th>
                <th className="text-right px-4 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && !error && (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-gray-500 text-sm">
                    No matched orders yet.
                  </td>
                </tr>
              )}
              {campaigns.map((c, i) => (
                <tr key={`${c.campaign_name}-${i}`} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-200">{c.campaign_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-gray-200">{c.orders}</td>
                  <td className="px-4 py-2 text-right text-gray-200">
                    {fmtMoney(c.total_value, "USD")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Recent orders">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="text-gray-500 text-xs uppercase tracking-wider">
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2">Time</th>
                <th className="text-left px-4 py-2">Order</th>
                <th className="text-right px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">UTM</th>
                <th className="text-left px-4 py-2">GCLID</th>
                <th className="text-left px-4 py-2">Match</th>
                <th className="text-left px-4 py-2">New?</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && !error && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500 text-sm">
                    No orders yet.
                  </td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{fmtDate(r.ordered_at)}</td>
                  <td className="px-4 py-2 text-gray-200">{r.order_number ?? r.id}</td>
                  <td className="px-4 py-2 text-right text-gray-200">{fmtMoney(r.total, r.currency)}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {r.utm_source ? (
                      <span>
                        {r.utm_source}
                        {r.utm_medium ? ` / ${r.utm_medium}` : ""}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-400">
                    {r.gclid ? (r.gclid.length > 18 ? `${r.gclid.slice(0, 18)}…` : r.gclid) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {r.gclid === null ? (
                      <span className="text-gray-600 text-xs">—</span>
                    ) : r.click_matched ? (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs border bg-emerald-900/40 text-emerald-300 border-emerald-700/50">
                        verified
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs border bg-amber-900/40 text-amber-300 border-amber-700/50">
                        no match
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400">
                    {r.is_new_customer === null ? "—" : r.is_new_customer ? "new" : "returning"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent = "text-white",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-800 text-sm text-white font-medium">{title}</div>
      {children}
    </div>
  );
}
