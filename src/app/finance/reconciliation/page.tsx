"use client";

import { useEffect, useState } from "react";
import { statements, sumByCategory, q1, monthRevenue } from "@/lib/financial-data";

// Q1 date range
const Q1_START = "2026-01-01";
const Q1_END = "2026-03-31";
const Q1_MONTHS = ["2026-01", "2026-02", "2026-03"];

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

interface SheetRow { month: string; cost: number; revenue?: number; }
interface SheetData { rows: SheetRow[]; totals: { cost: number; revenue?: number } }
interface GoogleMonth { month: string; totalSpend: number; totalConvValue: number; }

function filterQ1<T extends { month: string }>(rows: T[]): T[] {
  return rows.filter(r => Q1_MONTHS.includes(r.month));
}

// Bank digital ad spend per category from financial-data (acct 2285)
function bankDigitalAds() {
  const byMonth = statements.map(m => {
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
  return byMonth;
}

// Platform spend per month from sheet data
function sheetQ1Total(data: SheetData | null) {
  if (!data) return 0;
  return filterQ1(data.rows).reduce((s, r) => s + r.cost, 0);
}

export default function ReconciliationPage() {
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
    const errs: Record<string, string> = {};
    Promise.allSettled([
      fetch(`/api/shopify/orders?start=${Q1_START}&end=${Q1_END}`).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setShopify(d); }),
      fetch(`/api/google-ads/campaigns?start=${Q1_START}&end=${Q1_END}`).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); setGoogleMonths(Array.isArray(d) ? d : []); }),
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
  }, []);

  // ── Bank figures from financial-data ─────────────────────────────────────
  const bankRevenue = q1.totalRevenue; // acct 115 deposits
  const bankAds = bankDigitalAds();
  const bankTotalDigitalAds = bankAds.reduce((s, m) => s + m.digitalAds, 0);
  const bankKbbo = statements.reduce((s, m) => {
    return s + m.expenses.filter(e => e.category === "Unclassified Outflows (115)").reduce((ss, e) => ss + e.amount, 0);
  }, 0);

  // ── Live platform figures ─────────────────────────────────────────────────
  const googleQ1Spend = googleMonths.filter(m => Q1_MONTHS.includes(m.month)).reduce((s, m) => s + m.totalSpend, 0);
  const googleQ1Revenue = googleMonths.filter(m => Q1_MONTHS.includes(m.month)).reduce((s, m) => s + m.totalConvValue, 0);
  const bingQ1 = sheetQ1Total(bing);
  const metaQ1 = sheetQ1Total(meta);
  const connexityQ1 = sheetQ1Total(connexity);
  const pinterestQ1 = sheetQ1Total(pinterest);
  const amazonQ1 = sheetQ1Total(amazon);
  const totalPlatformSpend = googleQ1Spend + bingQ1 + metaQ1 + connexityQ1 + pinterestQ1 + amazonQ1;

  // Shopify Q1 revenue
  const shopifyNetRevenue = shopify?.summary.netRevenue ?? 0;
  const shopifyGrossRevenue = shopify?.summary.grossRevenue ?? 0;
  const shopifyRefunds = shopify?.summary.totalRefunds ?? 0;

  // Revenue gap: bank deposits vs shopify reported
  const revenueDiff = bankRevenue - shopifyNetRevenue;

  // Ad spend gap: platform reported vs bank digital ads categorized
  const adSpendDiff = totalPlatformSpend - bankTotalDigitalAds;

  const Skeleton = () => <div className="h-6 bg-gray-800 rounded animate-pulse w-24" />;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Reconciliation</h1>
        <p className="text-gray-400 text-sm mt-1">Q1 2026 — Live platform data vs bank statement actuals</p>
      </div>

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
            <div className="text-xs text-gray-500 mt-1">Acct …0115 Q1 total deposits</div>
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
              <th className="py-2.5 px-4 text-right">Shopify Gross</th>
              <th className="py-2.5 px-4 text-right">Shopify Net</th>
              <th className="py-2.5 px-4 text-right">Gap (Bank − Shopify Net)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {statements.map((m, i) => {
              const bankDep = monthRevenue(m);
              // We only have Q1 total from Shopify, not month-by-month from this API
              // Use bank deposits as the authoritative monthly figure
              return (
                <tr key={m.month} className="hover:bg-gray-800/30">
                  <td className="py-3 px-4 font-medium text-white">{m.shortMonth} {m.year}</td>
                  <td className="py-3 px-4 text-right text-green-400 font-medium">{fmt(bankDep)}</td>
                  <td className="py-3 px-4 text-right text-gray-500 text-xs">
                    {loading ? "—" : i === 0 ? `~${fmt(shopifyGrossRevenue / 3)}` : "—"}
                  </td>
                  <td className="py-3 px-4 text-right text-blue-400 text-xs">
                    {loading ? "—" : i === 0 ? `~${fmt(shopifyNetRevenue / 3)}` : "—"}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-500 text-xs">
                    {bankAds[i] ? fmt(bankDep) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-white text-sm">
              <td className="py-3 px-4">Q1 Total</td>
              <td className="py-3 px-4 text-right text-green-400">{fmt(bankRevenue)}</td>
              <td className="py-3 px-4 text-right text-gray-400">{loading ? "—" : fmt(shopifyGrossRevenue)}</td>
              <td className="py-3 px-4 text-right text-blue-400">{loading ? "—" : fmt(shopifyNetRevenue)}</td>
              <td className={`py-3 px-4 text-right ${loading ? "text-gray-500" : revenueDiff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {loading ? "—" : fmtDiff(revenueDiff)}
              </td>
            </tr>
          </tfoot>
        </table>
        <div className="px-5 py-3 bg-gray-800/30 border-t border-gray-800">
          <p className="text-xs text-gray-500">Shopify API returns Q1 aggregate — monthly Shopify breakdown requires date-filtered calls per month.</p>
        </div>
      </div>

      {/* ── SECTION 3: Ad Spend ───────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Ad Spend Reconciliation</h2>
          <p className="text-xs text-gray-500 mt-0.5">Platform-reported spend vs categorized bank outflows — KBBO now itemized; gap is platform-reporting lag/refunds</p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2.5 px-4 text-left">Platform</th>
              <th className="py-2.5 px-4 text-right">Platform Reported (Q1)</th>
              <th className="py-2.5 px-4 text-right">Bank Categorized</th>
              <th className="py-2.5 px-4 text-right">Difference</th>
              <th className="py-2.5 px-4 text-left">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {/* Google Ads */}
            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Google Ads
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.google ? <span className="text-red-400 text-xs">error</span> : fmt(googleQ1Spend)}
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {fmt(468_202.28)}
              </td>
              <td className="py-3 px-4 text-right">
                {loading || errors.google ? "—" : (
                  <span className="text-xs text-gray-400">{fmt(googleQ1Spend - 468_202.28)}</span>
                )}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Itemized from KBBO ACH export — 6 payments Jan–Mar</td>
            </tr>

            {/* Bing */}
            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white">
                <span className="w-2 h-2 rounded-full bg-teal-500 inline-block mr-2" />Bing / Microsoft
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.bing ? <span className="text-red-400 text-xs">error</span> : fmt(bingQ1)}
              </td>
              <td className="py-3 px-4 text-right text-gray-400">{fmt(bankAds.reduce((s, m) => s + m.msAds, 0))}</td>
              <td className={`py-3 px-4 text-right font-medium text-xs ${!loading && !errors.bing && Math.abs(bingQ1 - bankAds.reduce((s, m) => s + m.msAds, 0)) < 2000 ? "text-green-400" : "text-yellow-400"}`}>
                {loading || errors.bing ? "—" : fmtDiff(bingQ1 - bankAds.reduce((s, m) => s + m.msAds, 0))}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Direct card charges on acct …2285</td>
            </tr>

            {/* Meta */}
            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white">
                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block mr-2" />Meta / Facebook
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.meta ? <span className="text-red-400 text-xs">error</span> : fmt(metaQ1)}
              </td>
              <td className="py-3 px-4 text-right text-gray-400">{fmt(bankAds.reduce((s, m) => s + m.meta, 0))}</td>
              <td className={`py-3 px-4 text-right font-medium text-xs ${!loading && !errors.meta && Math.abs(metaQ1 - bankAds.reduce((s, m) => s + m.meta, 0)) < 2000 ? "text-green-400" : "text-yellow-400"}`}>
                {loading || errors.meta ? "—" : fmtDiff(metaQ1 - bankAds.reduce((s, m) => s + m.meta, 0))}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Direct card charges on acct …2285</td>
            </tr>

            {/* Connexity */}
            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white">
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block mr-2" />Connexity
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.connexity ? <span className="text-red-400 text-xs">error</span> : fmt(connexityQ1)}
              </td>
              <td className="py-3 px-4 text-right text-gray-400">{fmt(bankAds.reduce((s, m) => s + m.connexity, 0))}</td>
              <td className={`py-3 px-4 text-right font-medium text-xs ${!loading && !errors.connexity && Math.abs(connexityQ1 - bankAds.reduce((s, m) => s + m.connexity, 0)) < 2000 ? "text-green-400" : "text-yellow-400"}`}>
                {loading || errors.connexity ? "—" : fmtDiff(connexityQ1 - bankAds.reduce((s, m) => s + m.connexity, 0))}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Direct card charges on acct …2285</td>
            </tr>

            {/* Pinterest */}
            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block mr-2" />Pinterest
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.pinterest ? <span className="text-red-400 text-xs">error</span> : fmt(pinterestQ1)}
              </td>
              <td className="py-3 px-4 text-right text-gray-400">{fmt(bankAds.reduce((s, m) => s + m.pinterest, 0))}</td>
              <td className={`py-3 px-4 text-right font-medium text-xs ${!loading && !errors.pinterest && Math.abs(pinterestQ1 - bankAds.reduce((s, m) => s + m.pinterest, 0)) < 2000 ? "text-green-400" : "text-yellow-400"}`}>
                {loading || errors.pinterest ? "—" : fmtDiff(pinterestQ1 - bankAds.reduce((s, m) => s + m.pinterest, 0))}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Direct card charges on acct …2285</td>
            </tr>

            {/* Amazon */}
            <tr className="hover:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-white">
                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block mr-2" />Amazon Ads
              </td>
              <td className="py-3 px-4 text-right font-medium text-white">
                {loading ? <span className="text-gray-600">—</span> : errors.amazon ? <span className="text-red-400 text-xs">error</span> : fmt(amazonQ1)}
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
                {loading ? "—" : fmt(bingQ1 + metaQ1 + connexityQ1 + pinterestQ1 + amazonQ1)}
              </td>
              <td className="py-3 px-4 text-right text-gray-300">{fmt(bankTotalDigitalAds)}</td>
              <td className={`py-3 px-4 text-right text-sm ${loading ? "text-gray-500" : adSpendDiff - googleQ1Spend >= 0 ? "text-emerald-400" : "text-yellow-400"}`}>
                {loading ? "—" : fmtDiff(adSpendDiff - googleQ1Spend)}
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">Google excluded (shown separately above)</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── SECTION 4: KBBO Breakdown (itemized from ACH portal export) ─────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">KBBO ACH Q1 Breakdown</h2>
          <p className="text-xs text-gray-500 mt-0.5">Itemized from the KeyBank ACH portal export — no longer a mystery bucket</p>
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
              <div className="text-xs text-gray-500 mt-1">Import & Customs broker</div>
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
                <div className="text-xl font-bold text-yellow-400">{fmt(bankKbbo)}</div>
                <p className="text-xs text-yellow-200/70 mt-1">Bank statement shows 115 outflows beyond the KBBO portal — likely outgoing wires, checks, or other ACH rails. Needs bank statement PDFs to resolve.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 5: Google Ads ROAS ────────────────────────────────────── */}
      {!loading && !errors.google && googleQ1Spend > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Google Ads Q1 Performance</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Q1 Spend</div>
              <div className="text-xl font-bold text-white">{fmt(googleQ1Spend)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Attributed Revenue</div>
              <div className="text-xl font-bold text-white">{fmt(googleQ1Revenue)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ROAS</div>
              <div className={`text-xl font-bold ${googleQ1Spend > 0 ? (googleQ1Revenue / googleQ1Spend >= 5 ? "text-green-400" : googleQ1Revenue / googleQ1Spend >= 3 ? "text-yellow-400" : "text-red-400") : "text-gray-600"}`}>
                {googleQ1Spend > 0 ? `${(googleQ1Revenue / googleQ1Spend).toFixed(2)}x` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">As % of Q1 Revenue</div>
              <div className="text-xl font-bold text-white">{pct(googleQ1Spend, bankRevenue)}</div>
              <div className="text-xs text-gray-500 mt-1">of bank deposits</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
