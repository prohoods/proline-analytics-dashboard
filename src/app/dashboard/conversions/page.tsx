import { getSql } from "@/lib/db";

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

interface SummaryRow {
  status: string;
  count: number;
}

async function loadData() {
  const sql = getSql();
  try {
    const [rows, summary, last24] = await Promise.all([
      sql<UploadRow[]>`
        select id, source, source_id, conversion_action, gclid, gbraid, wbraid,
               conversion_value, currency, conversion_at, status, error_message, attempted_at
        from conversion_uploads
        order by attempted_at desc
        limit 200
      `,
      sql<SummaryRow[]>`
        select status, count(*)::int as count
        from conversion_uploads
        where attempted_at >= now() - interval '30 days'
        group by status
      `,
      sql<{ count: number }[]>`
        select count(*)::int as count
        from conversion_uploads
        where attempted_at >= now() - interval '24 hours'
      `,
    ]);
    return { rows, summary, last24h: last24[0]?.count ?? 0, error: null as string | null };
  } catch (e) {
    return {
      rows: [] as UploadRow[],
      summary: [] as SummaryRow[],
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

export default async function ConversionsPage() {
  const { rows, summary, last24h, error } = await loadData();
  const total = summary.reduce((s, r) => s + r.count, 0);
  const success = summary.find((r) => r.status === "success")?.count ?? 0;
  const errors = summary.find((r) => r.status === "error")?.count ?? 0;
  const skipped = summary.find((r) => r.status === "skipped")?.count ?? 0;
  // Success rate is measured against rows we actually tried to upload —
  // skipped rows (missing click id, etc.) never reached Google so they
  // shouldn't drag the denominator down.
  const attempted = success + errors;
  const successRate = attempted > 0 ? (success / attempted) * 100 : 0;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Ad Conversions</h1>
        <p className="text-sm text-gray-400 mt-1">
          Offline conversions uploaded to Google Ads. Replaces the legacy Zapier flow.
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <Stat label="Last 24h" value={last24h.toString()} />
        <Stat label="Last 30d (total)" value={total.toString()} />
        <Stat label="Last 30d (success)" value={success.toString()} accent="text-emerald-400" />
        <Stat
          label="Last 30d (skipped)"
          value={skipped.toString()}
          accent="text-gray-400"
        />
        <Stat
          label="Success rate (30d)"
          value={attempted > 0 ? `${successRate.toFixed(1)}%` : "—"}
          accent={errors > 0 ? "text-amber-400" : "text-emerald-400"}
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="text-sm text-white font-medium">Recent uploads</div>
          <div className="text-xs text-gray-500">most recent 200</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="text-gray-500 text-xs uppercase tracking-wider">
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2">Time</th>
                <th className="text-left px-4 py-2">Source</th>
                <th className="text-left px-4 py-2">Action</th>
                <th className="text-left px-4 py-2">Click ID</th>
                <th className="text-right px-4 py-2">Value</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500 text-sm">
                    No conversion uploads yet. Webhook activity will appear here.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const cid = clickId(r);
                return (
                  <tr key={r.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                    <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{fmtDate(r.attempted_at)}</td>
                    <td className="px-4 py-2 text-gray-300">
                      <span className="text-gray-100">{r.source}</span>
                      <span className="text-gray-500"> · {r.source_id}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-300">{r.conversion_action}</td>
                    <td className="px-4 py-2 text-gray-400">
                      {cid ? (
                        <span>
                          <span className="text-gray-500 text-xs mr-1">{cid.kind}</span>
                          <span className="font-mono text-xs">
                            {cid.value.length > 18 ? `${cid.value.slice(0, 18)}…` : cid.value}
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
                    <td className="px-4 py-2 text-xs text-red-300 max-w-[280px] truncate" title={r.error_message ?? ""}>
                      {r.error_message ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "text-white" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "success"
      ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/50"
      : status === "error"
      ? "bg-red-900/40 text-red-300 border-red-700/50"
      : "bg-gray-800 text-gray-400 border-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${styles}`}>
      {status}
    </span>
  );
}
