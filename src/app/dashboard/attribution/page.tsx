// Capture-rate dashboard. Compares shopify_orders against google_ads_clicks
// to measure how many Google-Ads-sourced orders carry a GCLID we recognize.
//
// Definitions:
//   captured           = order has a GCLID in note_attributes
//   verified           = captured AND gclid exists in google_ads_clicks
//   match quality      = verified / captured  (sanity check on capture)
//   click_view rows    = total click records pulled from Google Ads API

import { getSql } from "@/lib/db";
import { getRange, RangeKey } from "@/lib/date-ranges";
import UrlRangeDropdown from "@/components/UrlRangeDropdown";
import Tooltip from "@/components/Tooltip";

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

interface IdentityTotals {
  cross_new: number;
  cross_returning: number;
  first_touch_shopify: number;
  first_touch_callrail: number;
}

interface FirstTouchBreakdownRow {
  first_channel: string | null;
  orders: number;
  revenue: string | null;
  identities: number;
}

async function loadIdentityData(start: string, end: string) {
  const sql = getSql();
  try {
    const [identityTotals, firstTouchBreakdown] = await Promise.all([
      sql<IdentityTotals[]>`
        select
          count(*) filter (
            where ci.first_channel = 'shopify'
              and abs(extract(epoch from (ci.first_seen_at - so.ordered_at))) < 60
          )::int as cross_new,
          count(*) filter (
            where ci.id is not null
              and not (
                ci.first_channel = 'shopify'
                and abs(extract(epoch from (ci.first_seen_at - so.ordered_at))) < 60
              )
          )::int as cross_returning,
          count(*) filter (where ci.first_channel = 'shopify')::int as first_touch_shopify,
          count(*) filter (where ci.first_channel = 'callrail')::int as first_touch_callrail
        from shopify_orders so
        left join customer_identities ci on ci.id = so.customer_identity_id
        where so.ordered_at >= ${start}::date
          and so.ordered_at < (${end}::date + interval '1 day')
      `,
      sql<FirstTouchBreakdownRow[]>`
        select
          ci.first_channel,
          count(distinct so.id)::int as orders,
          sum(so.total)::text as revenue,
          count(distinct ci.id)::int as identities
        from shopify_orders so
        join customer_identities ci on ci.id = so.customer_identity_id
        where so.ordered_at >= ${start}::date
          and so.ordered_at < (${end}::date + interval '1 day')
        group by ci.first_channel
        order by orders desc
      `,
    ]);
    return {
      identityTotals: identityTotals[0] ?? {
        cross_new: 0,
        cross_returning: 0,
        first_touch_shopify: 0,
        first_touch_callrail: 0,
      },
      firstTouchBreakdown,
      identityError: null as string | null,
    };
  } catch (e) {
    return {
      identityTotals: {
        cross_new: 0,
        cross_returning: 0,
        first_touch_shopify: 0,
        first_touch_callrail: 0,
      },
      firstTouchBreakdown: [] as FirstTouchBreakdownRow[],
      identityError: e instanceof Error ? e.message : String(e),
    };
  }
}

async function loadData(start: string, end: string) {
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
        where ordered_at >= ${start}::date
          and ordered_at < (${end}::date + interval '1 day')
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
        where so.ordered_at >= ${start}::date
          and so.ordered_at < (${end}::date + interval '1 day')
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
        where so.ordered_at >= ${start}::date
          and so.ordered_at < (${end}::date + interval '1 day')
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
        where ordered_at >= ${start}::date
          and ordered_at < (${end}::date + interval '1 day')
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

export default async function AttributionPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const rangeKey: RangeKey = (params.range as RangeKey) || "30d";
  const range = getRange(rangeKey);

  const [
    { daily, recent, campaigns, totals, clickTotal, error },
    { identityTotals, firstTouchBreakdown, identityError },
  ] = await Promise.all([
    loadData(range.start, range.end),
    loadIdentityData(range.start, range.end),
  ]);

  const matchQuality = pct(totals.verified, totals.with_gclid);
  const gclidShare = pct(totals.with_gclid, totals.orders);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            GCLID Capture & Attribution
          </h1>
          <p className="text-sm text-gray-400 mt-1 max-w-2xl">
            Every Google Ads click gets stamped with a unique{" "}
            <code className="text-gray-300">GCLID</code>. When that click turns
            into a Shopify order, we save the GCLID on the order so Google can
            credit the right campaign. This page measures how reliably that
            handoff is working.
          </p>
        </div>
        <UrlRangeDropdown value={rangeKey} />
      </div>

      {/* Pipeline narrative */}
      <div className="mb-6 p-4 rounded-xl border border-gray-800 bg-gray-900/60">
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
          The attribution pipeline
        </div>
        <ol className="text-sm text-gray-300 space-y-1.5 list-decimal list-inside">
          <li>
            User clicks a Google Ad → lands on site with{" "}
            <code className="text-gray-400">?gclid=…</code> in the URL
          </li>
          <li>
            Storefront script saves the GCLID to a cookie + Shopify cart
            attribute
          </li>
          <li>
            Order is placed → GCLID is written into{" "}
            <code className="text-gray-400">note_attributes</code> on the order
          </li>
          <li>
            We pull the order in via webhook and join it against Google&apos;s
            click_view export to confirm the click is real
          </li>
          <li>
            Verified orders are uploaded back to Google Ads as offline
            conversions
          </li>
        </ol>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-700 bg-red-900/20 text-red-200 text-sm">
          <div className="font-semibold">Database error</div>
          <div className="mt-1 text-red-300">{error}</div>
          <div className="mt-2 text-xs text-red-300">
            Make sure migrations 006 and 007 are applied:{" "}
            <code className="px-1.5 py-0.5 rounded bg-black/40">
              POST /api/conversions/migrate
            </code>
          </div>
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Stat
          label={`Orders (${range.label})`}
          value={totals.orders.toString()}
          tooltip="Total Shopify orders placed in the selected window. Every other tile is measured against this number."
        />
        <Stat
          label="With GCLID"
          value={totals.with_gclid.toString()}
          sub={gclidShare}
          accent="text-blue-300"
          tooltip="Orders that arrived with a GCLID attached. These are orders we believe came from a Google Ads click. The % shows what share of all orders carry one."
        />
        <Stat
          label="Verified vs click_view"
          value={totals.verified.toString()}
          sub={`${totals.verified} / ${totals.with_gclid}`}
          accent="text-emerald-400"
          tooltip="Of the orders with a GCLID, how many of those GCLIDs match an actual Google Ads click record. A non-match means the GCLID is stale, fabricated, or from outside our ad account."
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
          tooltip="Health metric for the GCLID pipeline. >90% green means almost every GCLID we capture is a real Google click. Lower = either storefront capture is breaking, or non-Google traffic is being tagged."
        />
        <Stat
          label="From Google (utm)"
          value={totals.google_source.toString()}
          sub="unreliable proxy"
          tooltip="Orders where utm_source contains 'google'. Performance Max and Shopping campaigns often skip setting utm_source, so this number undercounts paid traffic — use GCLID capture as the source of truth."
        />
      </div>

      <div className="mb-6 text-xs text-gray-500">
        <span className="mr-4">
          <span className="text-gray-400">click_view rows in DB:</span>{" "}
          {clickTotal.toLocaleString()}
        </span>
        <span>
          <span className="text-gray-400">new customers ({range.label}):</span>{" "}
          {totals.new_customers}
        </span>
      </div>

      <Section
        title="Cross-channel new vs returning"
        subtitle={range.label}
        tooltip="Identity-resolved across Shopify + CallRail. A customer who called us months ago and now buys online is 'returning' here even though Shopify shows them as a new buyer."
      >
        <div className="p-4">
          <p className="text-xs text-gray-500 mb-4">
            &quot;New&quot; means this order created the customer&apos;s first
            touch anywhere in our system. &quot;Returning&quot; means we&apos;d
            seen them before — on a prior order, a CallRail phone call, or
            both. This replaces Shopify&apos;s built-in heuristic, which only
            counts order history.
          </p>
          {identityError && (
            <div className="mb-4 p-3 rounded-lg border border-amber-700 bg-amber-900/20 text-amber-200 text-xs">
              <div className="font-semibold">Identity table not ready</div>
              <div className="mt-1 text-amber-300">{identityError}</div>
              <div className="mt-2">
                Run{" "}
                <code className="px-1.5 py-0.5 rounded bg-black/40">
                  POST /api/conversions/migrate
                </code>{" "}
                then{" "}
                <code className="px-1.5 py-0.5 rounded bg-black/40">
                  POST /api/identities/backfill
                </code>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Stat
              label="New (cross-channel)"
              value={identityTotals.cross_new.toString()}
              accent="text-emerald-300"
              tooltip="Orders from a customer we'd never seen before — not on Shopify, not on CallRail."
            />
            <Stat
              label="Returning (cross-channel)"
              value={identityTotals.cross_returning.toString()}
              accent="text-blue-300"
              tooltip="Orders from a customer we recognized via prior Shopify activity or a previous phone call into CallRail."
            />
            <Stat
              label="First touch: Shopify"
              value={identityTotals.first_touch_shopify.toString()}
              tooltip="Of orders in this window, how many came from customers whose very first interaction was a Shopify order."
            />
            <Stat
              label="First touch: CallRail"
              value={identityTotals.first_touch_callrail.toString()}
              tooltip="Of orders in this window, how many came from customers who first called us (CallRail) before ever ordering online."
            />
          </div>
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs uppercase tracking-wider">
              <tr className="border-b border-gray-800">
                <th className="text-left px-2 py-2">First-touch channel</th>
                <th className="text-right px-2 py-2">Identities</th>
                <th className="text-right px-2 py-2">Orders</th>
                <th className="text-right px-2 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {firstTouchBreakdown.length === 0 && !error && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-gray-500 text-sm">
                    No identity-linked orders yet — run{" "}
                    <code className="px-1 py-0.5 rounded bg-black/40">
                      POST /api/identities/backfill
                    </code>
                  </td>
                </tr>
              )}
              {firstTouchBreakdown.map((r) => (
                <tr
                  key={r.first_channel ?? "null"}
                  className="border-b border-gray-800/60"
                >
                  <td className="px-2 py-2 text-gray-200">{r.first_channel ?? "—"}</td>
                  <td className="px-2 py-2 text-right text-gray-200">{r.identities}</td>
                  <td className="px-2 py-2 text-right text-gray-200">{r.orders}</td>
                  <td className="px-2 py-2 text-right text-gray-200">
                    {fmtMoney(r.revenue, "USD")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Daily breakdown"
        subtitle={range.label}
        tooltip="Day-by-day capture rate. A sudden drop in GCLID captured (blue column) is the earliest signal that storefront tracking is broken."
      >
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
                    No orders in this window.
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

      <Section
        title="Top campaigns (orders matched via GCLID)"
        subtitle={range.label}
        tooltip="Campaign attribution comes from Google's click_view table — the campaign that owned the click when the GCLID was minted. Only orders with a verified GCLID appear here."
      >
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
                    No matched orders in this window.
                  </td>
                </tr>
              )}
              {campaigns.map((c, i) => (
                <tr
                  key={`${c.campaign_name}-${i}`}
                  className="border-b border-gray-800/60 hover:bg-gray-800/30"
                >
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

      <Section
        title="Recent orders"
        subtitle={`Latest 100 in ${range.label}`}
        tooltip="Order-level detail. 'verified' means the GCLID matches a real Google click; 'no match' means we captured something but couldn't tie it to a real ad click."
      >
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
                    No orders in this window.
                  </td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-300 whitespace-nowrap">
                    {fmtDate(r.ordered_at)}
                  </td>
                  <td className="px-4 py-2 text-gray-200">{r.order_number ?? r.id}</td>
                  <td className="px-4 py-2 text-right text-gray-200">
                    {fmtMoney(r.total, r.currency)}
                  </td>
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
                    {r.gclid ? (
                      r.gclid.length > 18 ? `${r.gclid.slice(0, 18)}…` : r.gclid
                    ) : (
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
                    {r.is_new_customer === null
                      ? "—"
                      : r.is_new_customer
                      ? "new"
                      : "returning"}
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
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  tooltip?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-gray-500">
        <span>{label}</span>
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  tooltip,
  children,
}: {
  title: string;
  subtitle?: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <span className="text-sm text-white font-medium">{title}</span>
        {tooltip && <Tooltip text={tooltip} />}
        {subtitle && (
          <span className="ml-auto text-xs text-gray-500">{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}
