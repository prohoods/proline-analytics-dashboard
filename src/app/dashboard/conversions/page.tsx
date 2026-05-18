import { getSql } from "@/lib/db";
import Tooltip from "@/components/Tooltip";

export const dynamic = "force-dynamic";

interface UploadRow {
  id: number;
  source: string;
  source_id: string;
  conversion_action: string;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  conversion_value: string | null;
  currency: string | null;
  conversion_at: Date;
  status: string;
  error_message: string | null;
  attempted_at: Date;
}

// Bucket reflects the *latest attempt per logical upload*:
//   success    — Google accepted at some point
//   retryable  — last attempt errored, retry cron will pick it up
//   permanent  — last attempt errored with a known-permanent message
//                (outside Google's attribution window, missing required field,
//                phone_call_sale without a gclid). Will never succeed; tracked
//                separately so it doesn't drag the success rate down.
//   skipped    — we caught a problem before sending (no click id at all)
type Bucket = "success" | "retryable" | "permanent" | "skipped";

interface SummaryRow {
  bucket: Bucket;
  count: number;
}

interface ActionBreakdownRow {
  conversion_action: string;
  bucket: Bucket;
  count: number;
  total_value: string | null;
}

async function loadData() {
  const sql = getSql();
  // Permanent-error patterns mirror /api/conversions/retry — keep in sync.
  // Inlined in both queries below (postgres.js tagged templates don't accept
  // raw SQL fragments without sql.unsafe, and duplication is clearer here).
  try {
    const [rows, summary, last24, byAction] = await Promise.all([
      sql<UploadRow[]>`
        select id, source, source_id, conversion_action, gclid, gbraid, wbraid,
               conversion_value, currency, conversion_at, status, error_message, attempted_at
        from conversion_uploads
        order by attempted_at desc
        limit 200
      `,
      // Latest attempt per dedupe_key in the last 30 days, bucketed.
      sql<SummaryRow[]>`
        with latest as (
          select distinct on (dedupe_key)
            dedupe_key, status, error_message
          from conversion_uploads
          where attempted_at >= now() - interval '30 days'
            and dedupe_key is not null
          order by dedupe_key, attempt desc, id desc
        )
        select
          case
            when status = 'success' then 'success'
            when status = 'skipped' then 'skipped'
            when status = 'error' and (
              coalesce(error_message, '') ilike '%click-through window%'
              or coalesce(error_message, '') ilike '%requires gclid%'
              or coalesce(error_message, '') ilike '%required field was not present%'
            ) then 'permanent'
            when status = 'error' then 'retryable'
            else status
          end as bucket,
          count(*)::int as count
        from latest
        group by 1
      `,
      sql<{ count: number }[]>`
        select count(*)::int as count
        from conversion_uploads
        where attempted_at >= now() - interval '24 hours'
      `,
      sql<ActionBreakdownRow[]>`
        with latest as (
          select distinct on (dedupe_key)
            dedupe_key, conversion_action, status, error_message, conversion_value
          from conversion_uploads
          where attempted_at >= now() - interval '30 days'
            and dedupe_key is not null
          order by dedupe_key, attempt desc, id desc
        )
        select
          conversion_action,
          case
            when status = 'success' then 'success'
            when status = 'skipped' then 'skipped'
            when status = 'error' and (
              coalesce(error_message, '') ilike '%click-through window%'
              or coalesce(error_message, '') ilike '%requires gclid%'
              or coalesce(error_message, '') ilike '%required field was not present%'
            ) then 'permanent'
            when status = 'error' then 'retryable'
            else status
          end as bucket,
          count(*)::int as count,
          sum(case when status = 'success' then conversion_value::numeric else 0 end)::text as total_value
        from latest
        group by conversion_action, bucket
        order by conversion_action, bucket
      `,
    ]);
    return {
      rows,
      summary,
      byAction,
      last24h: last24[0]?.count ?? 0,
      error: null as string | null,
    };
  } catch (e) {
    return {
      rows: [] as UploadRow[],
      summary: [] as SummaryRow[],
      byAction: [] as ActionBreakdownRow[],
      last24h: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function fmtMoney(v: string | null, currency: string | null) {
  if (v === null) return "—";
  const n = parseFloat(v);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    maximumFractionDigits: 2,
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

function clickId(r: UploadRow) {
  if (r.gclid) return { kind: "GCLID", value: r.gclid };
  if (r.gbraid) return { kind: "GBRAID", value: r.gbraid };
  if (r.wbraid) return { kind: "WBRAID", value: r.wbraid };
  return null;
}

const ACTION_LABEL: Record<string, string> = {
  offline_purchase: "Online order (Google click)",
  offline_purchase_gbraid: "Online order (iOS app click)",
  phone_call_sale: "Phone-call-to-order",
};

const ACTION_DESCRIPTION: Record<string, string> = {
  offline_purchase:
    "Customer clicked a Google Ad, browsed, and placed a Shopify order. We saved the GCLID from the click and now upload it back with the order value.",
  offline_purchase_gbraid:
    "Same as 'Online order' but the click came from an iOS app where Apple's privacy framework hides the user. Google sent us a GBRAID instead of a GCLID.",
  phone_call_sale:
    "Customer first called us (CallRail captured the GCLID off the inbound call), then later placed a Shopify order under the same phone number. We credit the original ad click.",
};

export default async function ConversionsPage() {
  const { rows, summary, byAction, last24h, error } = await loadData();
  const bucketCount = (b: Bucket) =>
    summary.find((r) => r.bucket === b)?.count ?? 0;
  const success = bucketCount("success");
  const retryable = bucketCount("retryable");
  const permanent = bucketCount("permanent");
  const skipped = bucketCount("skipped");
  const total = success + retryable + permanent + skipped;
  // Pipeline health = success ÷ (success + retryable). Excludes permanents
  // (unrecoverable data issues — order outside the 90d window, missing
  // required field) and skipped (no click id, never sent).
  const attempted = success + retryable;
  const successRate = attempted > 0 ? (success / attempted) * 100 : 0;

  // Pivot byAction → one row per conversion_action with bucket counts.
  const actionPivot = new Map<
    string,
    {
      action: string;
      success: number;
      retryable: number;
      permanent: number;
      skipped: number;
      revenue: number;
    }
  >();
  for (const r of byAction) {
    const cur = actionPivot.get(r.conversion_action) ?? {
      action: r.conversion_action,
      success: 0,
      retryable: 0,
      permanent: 0,
      skipped: 0,
      revenue: 0,
    };
    if (r.bucket === "success") {
      cur.success += r.count;
      cur.revenue += parseFloat(r.total_value ?? "0") || 0;
    } else if (r.bucket === "retryable") {
      cur.retryable += r.count;
    } else if (r.bucket === "permanent") {
      cur.permanent += r.count;
    } else {
      cur.skipped += r.count;
    }
    actionPivot.set(r.conversion_action, cur);
  }
  const actions = Array.from(actionPivot.values()).sort(
    (a, b) =>
      b.success + b.retryable + b.permanent - (a.success + a.retryable + a.permanent)
  );

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Ad Conversions</h1>
        <p className="text-sm text-gray-400 mt-1 max-w-3xl">
          Real revenue events that we send back to Google Ads so it can credit
          the right campaign and learn what to bid on. Replaces the legacy
          Zapier flow.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-700 bg-red-900/20 text-red-200 text-sm">
          <div className="font-semibold">Database error</div>
          <div className="mt-1 text-red-300">{error}</div>
          <div className="mt-2 text-xs text-red-300">
            If the table doesn&apos;t exist yet, run the migration:
            <code className="ml-1 px-1.5 py-0.5 rounded bg-black/40">
              POST /api/conversions/migrate
            </code>
          </div>
        </div>
      )}

      {/* KPI tiles. Counts reflect the latest attempt per logical upload
          (deduped on dedupe_key), not every retry row in the table. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <Stat
          label="Last 24h"
          value={last24h.toString()}
          tooltip="Every upload attempt logged in the past 24 hours, including retries. Counts attempts, not unique conversions."
        />
        <Stat
          label="Last 30d (uploads)"
          value={total.toString()}
          tooltip="Distinct conversions in the past 30 days (one count per source order/call, not per retry). Sum of success + retryable + permanent + skipped below."
        />
        <Stat
          label="Success"
          value={success.toString()}
          accent="text-emerald-400"
          tooltip="Google accepted the upload. These are the only rows actually contributing to campaign optimization."
        />
        <Stat
          label="Retryable"
          value={retryable.toString()}
          accent={retryable > 0 ? "text-amber-400" : "text-gray-400"}
          tooltip="Last attempt errored but the cron will retry — transient failures (network, rate limit, temporary Google API issue). These are the actionable failures."
        />
        <Stat
          label="Permanent"
          value={permanent.toString()}
          accent="text-gray-400"
          tooltip="Errored with a message Google won't change its mind on: order outside the 90-day attribution window, missing required field, or phone-call upload without a gclid. Not retried. Excluded from success rate because they're data-quality issues, not pipeline issues."
        />
        <Stat
          label="Success rate"
          value={attempted > 0 ? `${successRate.toFixed(1)}%` : "—"}
          accent={
            successRate >= 90
              ? "text-emerald-400"
              : successRate >= 70
              ? "text-amber-400"
              : "text-red-400"
          }
          tooltip="Success ÷ (success + retryable). Permanent and skipped are excluded because they represent unrecoverable data conditions, not pipeline failures."
        />
      </div>

      {skipped > 0 && (
        <div className="mb-6 text-xs text-gray-500">
          Also {skipped.toLocaleString()} skipped in the last 30 days (no click
          id at all — never sent to Google).
        </div>
      )}

      {/* Action types explainer */}
      <Section
        title="What we upload, by type"
        tooltip="Three Google Ads conversion actions are wired up. Each represents a different attribution scenario — the click identifier (gclid vs gbraid vs phone-call) determines which one to use."
      >
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {actions.length === 0 && (
            <div className="text-gray-500 text-sm">
              No uploads yet in the last 30 days.
            </div>
          )}
          {actions.map((a) => {
            const label = ACTION_LABEL[a.action] ?? a.action;
            const desc = ACTION_DESCRIPTION[a.action] ?? "";
            const att = a.success + a.retryable;
            const rate = att > 0 ? (a.success / att) * 100 : 0;
            return (
              <div
                key={a.action}
                className="rounded-lg border border-gray-800 bg-gray-950/40 p-4"
              >
                <div className="text-sm text-white font-medium">{label}</div>
                <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                  {a.action}
                </div>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  {desc}
                </p>
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                  <Mini label="Sent" value={a.success} accent="text-emerald-300" />
                  <Mini label="Retryable" value={a.retryable} accent="text-amber-300" />
                  <Mini label="Permanent" value={a.permanent} accent="text-gray-400" />
                  <Mini label="Skipped" value={a.skipped} accent="text-gray-500" />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Success rate</span>
                  <span
                    className={
                      rate >= 90
                        ? "text-emerald-300"
                        : rate >= 50
                        ? "text-amber-300"
                        : "text-red-300"
                    }
                  >
                    {att > 0 ? `${rate.toFixed(1)}%` : "—"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Revenue credited</span>
                  <span className="text-gray-200">
                    {a.revenue > 0
                      ? new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 0,
                        }).format(a.revenue)
                      : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Status legend */}
      <div className="mb-6 p-3 rounded-lg border border-gray-800 bg-gray-900/40 flex flex-wrap gap-4 text-xs text-gray-400">
        <span className="text-gray-500 uppercase tracking-wider mr-2">
          Status legend
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge status="success" />
          Google accepted the upload — campaign credit applied.
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge status="error" />
          Google rejected or we didn&apos;t get a response. Retried daily unless
          the message is permanent (outside the attribution window, missing
          required field).
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge status="skipped" />
          We refused to send — missing or invalid click ID. Not retried.
        </span>
      </div>

      {/* Recent uploads */}
      <Section
        title="Recent uploads"
        subtitle="most recent 200"
        tooltip="Every row is one attempt to send a conversion to Google Ads. Click ID column shows the identifier we used — without one, Google can't credit any campaign."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="text-gray-500 text-xs uppercase tracking-wider">
              <tr className="border-b border-gray-800">
                <Th>Time</Th>
                <Th tooltip="Where the conversion came from: 'shopify' = Shopify order webhook, 'callrail' = CallRail call webhook.">
                  Source
                </Th>
                <Th tooltip="Which Google Ads conversion action this upload counts against. Each action is configured separately in Google Ads.">
                  Action
                </Th>
                <Th tooltip="The click identifier we sent. GCLID = standard web click. GBRAID = iOS app click (privacy-preserving). Empty means no click could be matched — those rows will be skipped.">
                  Click ID
                </Th>
                <Th align="right" tooltip="Revenue value we told Google this conversion was worth. Drives the bidding algorithm.">
                  Value
                </Th>
                <Th tooltip="success = Google accepted. error = Google rejected (or network failed). skipped = we caught a problem before sending.">
                  Status
                </Th>
                <Th tooltip="Raw error message from Google or our pre-flight check. Hover the truncated text to see the full string.">
                  Error
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500 text-sm">
                    No conversion uploads yet. Webhook activity will appear
                    here.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const cid = clickId(r);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-gray-800/60 hover:bg-gray-800/30"
                  >
                    <td className="px-4 py-2 text-gray-300 whitespace-nowrap">
                      {fmtDate(r.attempted_at)}
                    </td>
                    <td className="px-4 py-2 text-gray-300">
                      <span className="text-gray-100">{r.source}</span>
                      <span className="text-gray-500"> · {r.source_id}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-300">
                      {r.conversion_action}
                    </td>
                    <td className="px-4 py-2 text-gray-400">
                      {cid ? (
                        <span>
                          <span className="text-gray-500 text-xs mr-1">
                            {cid.kind}
                          </span>
                          <span className="font-mono text-xs">
                            {cid.value.length > 18
                              ? `${cid.value.slice(0, 18)}…`
                              : cid.value}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-200">
                      {fmtMoney(r.conversion_value, r.currency)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td
                      className="px-4 py-2 text-xs text-red-300 max-w-[280px] truncate"
                      title={r.error_message ?? ""}
                    >
                      {r.error_message ?? ""}
                    </td>
                  </tr>
                );
              })}
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
  accent = "text-white",
  tooltip,
}: {
  label: string;
  value: string;
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
    </div>
  );
}

function Mini({
  label,
  value,
  accent = "text-white",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className={`text-sm font-medium ${accent}`}>{value}</div>
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

function Th({
  children,
  align = "left",
  tooltip,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  tooltip?: string;
}) {
  return (
    <th className={`px-4 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <span className="inline-flex items-center gap-1.5">
        {children}
        {tooltip && <Tooltip text={tooltip} />}
      </span>
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "success"
      ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/50"
      : status === "error"
      ? "bg-red-900/40 text-red-300 border-red-700/50"
      : status === "skipped"
      ? "bg-gray-800 text-gray-400 border-gray-700"
      : "bg-gray-800 text-gray-400 border-gray-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${styles}`}
    >
      {status}
    </span>
  );
}
