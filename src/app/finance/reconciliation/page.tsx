"use client";

import { useEffect, useState } from "react";
import { useFinancialData } from "@/lib/use-financial-data";
import type { RangeKey } from "@/lib/date-ranges";
import DateRangeDropdown from "@/components/DateRangeDropdown";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtDiff(n: number) {
  const sign = n >= 0 ? "+" : "";
  return sign + new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function pct(a: number, b: number) {
  if (!b) return "—";
  return ((a / b) * 100).toFixed(1) + "%";
}

const MONTH_LIST = ["January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"];
function pad(n: number) { return String(n).padStart(2, "0"); }

interface SheetRow { month: string; cost: number; revenue?: number; }
interface SheetData { rows: SheetRow[]; totals: { cost: number; revenue?: number } }
interface GoogleMonth { month: string; totalSpend: number; totalConvValue: number; }

function inMonths<T extends { month: string }>(rows: T[], months: string[]): T[] {
  return rows.filter(r => months.includes(r.month));
}

function sheetTotal(data: SheetData | null, months: string[]) {
  if (!data) return 0;
  return inMonths(data.rows, months).reduce((s, r) => s + r.cost, 0);
}

export default function ReconciliationPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const { statements, sumByCategory, q1, monthRevenue, range } = useFinancialData(rangeKey);

  // YYYY-MM keys covered by the filtered statements (used to align platform data)
  const monthKeys = statements.map(m => {
    const idx = MONTH_LIST.indexOf(m.month);
    return `${m.year}-${pad(idx + 1)}`;
  });

  const hasData = statements.length > 0;
  const isQ1 = range.startYM === "2026-01" && range.endYM === "2026-03";

  const [shopify, setShopify] = useState<{ summary: { grossRevenue: number; netRevenue: number; totalRefunds: number; totalOrders: number } } | null>(null);
  const [googleMonths, setGoogleMonths] = useState<GoogleMonth[]>([]);
  const [bing, setBing] = useState<SheetData | null>(null);
  const [meta, setMeta] = useState<SheetData | null>(null);
  const [connexity, setConnexity] = useState<SheetData | null>(null);
  const [pinterest, setPinterest] = useState<SheetData | null>(null);
  const [amazon, setAmazon] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    setShopify(null);
    setGoogleMonths([]);
    const errs: Record<string, string> = {};
    Promise.allSettled([
      fetch(`/api/shopify/orders?start=${range.start}&end=${range.end}`).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setShopify(d); }),
      fetch(`/api/google-ads/campaigns?start=${range.start}&end=${range.end}`).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setGoogleMonths(Array.isArray(d) ? d : []); }),
      fetch("/api/sheets/bing").then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setBing(d); }),
      fetch("/api/sheets/meta").then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setMeta(d); }),
      fetch("/api/sheets/connexity").then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setConnexity(d); }),
      fetch("/api/sheets/pinterest").then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setPinterest(d); }),
      fetch("/api/sheets/amazon-ads").then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setAmazon(d); }),
    ]).then(results => {
      const keys = ["shopify", "google", "bing", "meta", "connexity", "pinterest", "amazon"];
      results.forEach((r, i) => { if (r.status === "rejected") errs[keys[i]] = r.reason?.message ?? "Failed"; });
      setErrors(errs);
      setLoading(false);
    });
  }, [range.start, range.end]);

  // ── Bank digital-ad spend by month (acct 2285 categorized) ──────────────
  const bankAds = statements.map(m => {
    const cats = sumByCategory(m);
    return {
      month: m.shortMonth,
      digitalAds: cats["Digital Advertising"] ?? 0,
      msAds: m.expenses.filter(e => e.vendor.includes("Microsoft") || e.vendor.includes("Bing")).reduce((s, e) => s + e.amount, 0),
      connexity: m.expenses.filter(e => e.vendor.includes("Connexity")).reduce((s, e) => s + e.amount, 0),
      meta: m.expenses.filter(e => e.vendor.includes("Facebook") || e.vendor.includes("Meta")).reduce((s, e) => s + e.amount, 0),
      pinterest: m.expenses.filter(e => e.vendor.includes("Pinterest")).reduce((s, e) => s + e.amount, 0),
      growMyAds: m.expenses.filter(e => e.vendor.includes("Grow My Ads")).reduce((s, e) => s + e.amount, 0),
    };
  });

  const bankRevenue = q1.totalRevenue;
  const bankTotalDigitalAds = bankAds.reduce((s, m) => s + m.digitalAds, 0);
  const bankUnclassified = statements.reduce((s, m) => {
    return s + m.expenses.filter(e => e.category === "Unclassified Outflows (115)").reduce((ss, e) => ss + e.amount, 0);
  }, 0);

  // ── Live platform figures aligned to the selected range ────────────────
  const googleSpend = inMonths(googleMonths, monthKeys).reduce((s, m) => s + m.totalSpend, 0);
  const googleRevenue = inMonths(googleMonths, monthKeys).reduce((s, m) => s + m.totalConvValue, 0);
  const bingSpend = sheetTotal(bing, monthKeys);
  const metaSpend = sheetTotal(meta, monthKeys);
  const connexitySpend = sheetTotal(connexity, monthKeys);
  const pinterestSpend = sheetTotal(pinterest, monthKeys);
  const amazonSpend = sheetTotal(amazon, monthKeys);
  const totalPlatformSpend = googleSpend + bingSpend + metaSpend + connexitySpend + pinterestSpend + amazonSpend;

  const shopifyNetRevenue = shopify?.summary.netRevenue ?? 0;
  const shopifyGrossRevenue = shopify?.summary.grossRevenue ?? 0;
  const shopifyRefunds = shopify?.summary.totalRefunds ?? 0;

  const revenueDiff = bankRevenue - shopifyNetRevenue;
  const adSpendDiff = totalPlatformSpend - bankTotalDigitalAds;

  const Skeleton = () => <div className="h-6 bg-gray-800 rounded animate-pulse w-24" />;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-900/40 border border-blue-800/40 flex items-center justify-center text-xl">🔍</div>
          <div>
            <h1 className="text-2xl font-bold text-white">Reconciliation</h1>
            <p className="text-gray-500 text-sm mt-0.5">{range.label} — Live platform data vs bank statement actuals</p>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {!hasData ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
          No statements in this period yet. Upload a bank statement on the <a href="/finance/upload" className="text-blue-400 hover:underline">upload page</a>, or pick a different range.
        </div>
      ) : (
      <>
      {/* ── SECTION 1: Revenue ─────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Revenue Reconciliation</h2>
          <p className="text-xs text-gray-500 mt-0.5">Shopify reported revenue vs what actually deposited into KeyBank acct …0115</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-800">
          <div className="p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Bank Deposits (Cash In)</div>
            <div className="text-2xl font-bold text-green-400">{fmt(bankRevenue)}</div>
            <div className="text-xs text-gray-500 mt-1">Acct …0115 deposits — {range.label}</div>
          </div>
          <div className="p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-2">
              Shopify Net Revenue
              {errors.shopify && <span className="text-red-400 normal-case">error</span>}
            </div>
            {loading ? <Skeleton /> : <div className="text-2xl font-bold text-blue-400">{fmt(shopifyNetRevenue)}</div>}
            <div className="text-xs text-gray-500 mt-1">{loading ? "" : `${fmt(shopifyGrossRevenue)} gross − ${fmt(shopifyRefunds)} refunds`}</div>
          </div>
          <div className="p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Gap</div>
            {loading ? <Skeleton /> : (
              <div className={`text-2xl font-bold ${Math.abs(revenueDiff) < 50000 ? "text-yellow-400" : revenueDiff > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtDiff(revenueDiff)}
              </div>
            )}
            <div className="text-xs text-gray-500 mt-1">Bank deposits minus Shopify net</div>
          </div>
        </div>

        {!loading && !errors.shopify && (
          <div className="px-5 py-3 bg-gray-800/30 border-t border-gray-800">
            <p className="text-xs text-gray-400">
              {Math.abs(revenueDiff) < 10000
                ? "Revenue reconciles closely — minimal gap between Shopify and bank."
                : revenueDiff > 0
                  ? `Bank shows ${fmt(revenueDiff)} more than Shopify reports. This likely includes marketplace deposits (Ferguson, Amazon), payment timing, or non-Shopify revenue.`
                  : `Shopify reports ${fmt(Math.abs(revenueDiff))} more than bank deposits. Could reflect payment processor timing (Stripe payout delay) or pending settlements.`
              }
            </p>
          </div>
        )}
      </div>

      {/* ── SECTION 2: Month-by-month revenue ─────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Monthly Revenue — Bank vs Shopify</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2.5 px-4 text-left">Month</th>
              <th className="py-2.5 px-4 text-right">Bank Deposits</th>
              <th className="py-2.5 px-4 text-right">Shopify (period avg)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {statements.map(m => {
              const bankDep = monthRevenue(m);
              const shopifyAvg = shopifyNetRevenue / Math.max(1, statements.length);
              return (
                <tr key={`${m.year}-${m.month}`} className="hover:bg-gray-800/30">
                  <td className="py-3 px-4 font-medium text-white">{m.shortMonth} {m.year}</td>
                  <td className="py-3 px-4 text-right text-green-400 font-medium">{fmt(bankDep)}</td>
                  <td className="py-3 px-4 text-right text-blue-400 text-xs">
                    {loading ? "—" : `~${fmt(shopifyAvg)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-white text-sm">
              <td className="py-3 px-4">{range.label} Total</td>
              <td className="py-3 px-4 text-right text-green-400">{fmt(bankRevenue)}</td>
              <td className="py-3 px-4 text-right text-blue-400">{loading ? "—" : fmt(shopifyNetRevenue)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="px-5 py-3 bg-gray-800/30 border-t border-gray-800">
          <p className="text-xs text-gray-500">Shopify API returns the period aggregate — monthly Shopify breakdown requires date-filtered calls per month.</p>
        </div>
      </div>

      {/* ── SECTION 3: Ad Spend ───────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Ad Spend Reconciliation</h2>
          <p className="text-xs text-gray-500 mt-0.5">Platform-reported spend vs categorized bank outflows for {range.label}</p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2.5 px-4 text-left">Platform</th>
              <th className="py-2.5 px-4 text-right">Platform Reported</th>
              <th className="py-2.5 px-4 text-right">Bank Categorized</th>
              <th className="py-2.5 px-4 text-right">Difference</th>
              <th className="py-2.5 px-4 text-left">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Google Ads
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.google ? <span className="text-red-400 text-xs">error</span> : fmt(googleSpend)}
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {fmt(bankAds.reduce((s, m) => s + m.digitalAds, 0))}
              </td>
              <td className="py-3 px-4 text-right">
                {loading || errors.google ? "—" : (
                  <span className="text-xs text-gray-400">{fmtDiff(googleSpend - bankAds.reduce((s, m) => s + m.digitalAds, 0))}</span>
                )}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Bank-categorized = all Digital Advertising on acct …2285 + KBBO Google ACH</td>
            </tr>

            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white">
                <span className="w-2 h-2 rounded-full bg-teal-500 inline-block mr-2" />Bing / Microsoft
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.bing ? <span className="text-red-400 text-xs">error</span> : fmt(bingSpend)}
              </td>
              <td className="py-3 px-4 text-right text-gray-400">{fmt(bankAds.reduce((s, m) => s + m.msAds, 0))}</td>
              <td className={`py-3 px-4 text-right font-medium text-xs ${!loading && !errors.bing && Math.abs(bingSpend - bankAds.reduce((s, m) => s + m.msAds, 0)) < 2000 ? "text-green-400" : "text-yellow-400"}`}>
                {loading || errors.bing ? "—" : fmtDiff(bingSpend - bankAds.reduce((s, m) => s + m.msAds, 0))}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Direct card charges on acct …2285</td>
            </tr>

            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white">
                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block mr-2" />Meta / Facebook
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.meta ? <span className="text-red-400 text-xs">error</span> : fmt(metaSpend)}
              </td>
              <td className="py-3 px-4 text-right text-gray-400">{fmt(bankAds.reduce((s, m) => s + m.meta, 0))}</td>
              <td className={`py-3 px-4 text-right font-medium text-xs ${!loading && !errors.meta && Math.abs(metaSpend - bankAds.reduce((s, m) => s + m.meta, 0)) < 2000 ? "text-green-400" : "text-yellow-400"}`}>
                {loading || errors.meta ? "—" : fmtDiff(metaSpend - bankAds.reduce((s, m) => s + m.meta, 0))}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Direct card charges on acct …2285</td>
            </tr>

            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white">
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block mr-2" />Connexity
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.connexity ? <span className="text-red-400 text-xs">error</span> : fmt(connexitySpend)}
              </td>
              <td className="py-3 px-4 text-right text-gray-400">{fmt(bankAds.reduce((s, m) => s + m.connexity, 0))}</td>
              <td className={`py-3 px-4 text-right font-medium text-xs ${!loading && !errors.connexity && Math.abs(connexitySpend - bankAds.reduce((s, m) => s + m.connexity, 0)) < 2000 ? "text-green-400" : "text-yellow-400"}`}>
                {loading || errors.connexity ? "—" : fmtDiff(connexitySpend - bankAds.reduce((s, m) => s + m.connexity, 0))}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Direct card charges on acct …2285</td>
            </tr>

            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block mr-2" />Pinterest
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.pinterest ? <span className="text-red-400 text-xs">error</span> : fmt(pinterestSpend)}
              </td>
              <td className="py-3 px-4 text-right text-gray-400">{fmt(bankAds.reduce((s, m) => s + m.pinterest, 0))}</td>
              <td className={`py-3 px-4 text-right font-medium text-xs ${!loading && !errors.pinterest && Math.abs(pinterestSpend - bankAds.reduce((s, m) => s + m.pinterest, 0)) < 2000 ? "text-green-400" : "text-yellow-400"}`}>
                {loading || errors.pinterest ? "—" : fmtDiff(pinterestSpend - bankAds.reduce((s, m) => s + m.pinterest, 0))}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Direct card charges on acct …2285</td>
            </tr>

            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white">
                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block mr-2" />Amazon Ads
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.amazon ? <span className="text-red-400 text-xs">error</span> : fmt(amazonSpend)}
              </td>
              <td className="py-3 px-4 text-right text-gray-400">—</td>
              <td className="py-3 px-4 text-right text-xs text-gray-500">—</td>
              <td className="py-3 px-4 text-xs text-gray-500">Not yet tracked in bank statements</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-white text-sm">
              <td className="py-3 px-4">Total (ex Google)</td>
              <td className="py-3 px-4 text-right">
                {loading ? "—" : fmt(bingSpend + metaSpend + connexitySpend + pinterestSpend + amazonSpend)}
              </td>
              <td className="py-3 px-4 text-right text-gray-300">{fmt(bankTotalDigitalAds)}</td>
              <td className={`py-3 px-4 text-right text-sm ${loading ? "text-gray-500" : adSpendDiff - googleSpend >= 0 ? "text-emerald-400" : "text-yellow-400"}`}>
                {loading ? "—" : fmtDiff(adSpendDiff - googleSpend)}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Google excluded (shown separately above)</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── SECTION 4: KBBO Q1 reference (only when Q1 is in view) ─────── */}
      {isQ1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">KBBO ACH Q1 2026 Breakdown</h2>
            <p className="text-xs text-gray-500 mt-0.5">Itemized from the KeyBank ACH portal export — fixed reference for Q1 only</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Google Ads (via KBBO)</div>
                <div className="text-xl font-bold text-blue-400">{fmt(468_202.28)}</div>
                <div className="text-xs text-gray-500 mt-1">84% of KBBO — Digital Ads</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Zline (SHL COGS)</div>
                <div className="text-xl font-bold text-cyan-400">{fmt(36_965.97)}</div>
                <div className="text-xs text-gray-500 mt-1">Wholesale supplier — tagged side=SHL</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Worldwide Logistic</div>
                <div className="text-xl font-bold text-violet-400">{fmt(43_282.53)}</div>
                <div className="text-xs text-gray-500 mt-1">Import &amp; Customs broker</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Renan Bonin (Web Dev)</div>
                <div className="text-xl font-bold text-pink-400">{fmt(10_400)}</div>
                <div className="text-xs text-gray-500 mt-1">$5,200 × 2 — designer retainer</div>
              </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-yellow-300 uppercase tracking-wide">Residual: Non-KBBO 115 Outflows</div>
                  <div className="text-xl font-bold text-yellow-400">{fmt(bankUnclassified)}</div>
                  <p className="text-xs text-yellow-200/70 mt-1">Bank statement shows 115 outflows beyond the KBBO portal — likely outgoing wires, checks, or other ACH rails.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 5: Google Ads ROAS ────────────────────────────────────── */}
      {!loading && !errors.google && googleSpend > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Google Ads {range.label} Performance</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Spend</div>
              <div className="text-xl font-bold text-white">{fmt(googleSpend)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Attributed Revenue</div>
              <div className="text-xl font-bold text-white">{fmt(googleRevenue)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ROAS</div>
              <div className={`text-xl font-bold ${googleSpend > 0 ? (googleRevenue / googleSpend >= 5 ? "text-green-400" : googleRevenue / googleSpend >= 3 ? "text-yellow-400" : "text-red-400") : "text-gray-600"}`}>
                {googleSpend > 0 ? `${(googleRevenue / googleSpend).toFixed(2)}x` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">As % of Revenue</div>
              <div className="text-xl font-bold text-white">{pct(googleSpend, bankRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">of bank deposits</div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
