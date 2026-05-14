"use client";

// Overall MER & Profitability — blends every paid channel against Shopify
// net revenue to give a true business-wide MER. Mirrors the Google MER page
// shape but the denominator includes Google + Meta + Bing + Pinterest +
// Amazon + Connexity + TikTok, and the numerator is Shopify revenue rather
// than platform-attributed conversion value.

import { useEffect, useMemo, useState } from "react";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import { RangeKey, getRange } from "@/lib/date-ranges";

const PROFIT_MARGIN = 0.40;

const fmtC = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const merColor = (m: number) =>
  m >= 3
    ? "text-green-400"
    : m >= 2
    ? "text-yellow-400"
    : m > 0
    ? "text-red-400"
    : "text-gray-500";

interface GoogleMonth {
  month: string;
  totalSpend: number;
  totalConvValue: number;
}

interface ShopifyMonth {
  month: string;
  netSales: number;
  totalSales: number;
}

interface MonthRow {
  month: string;
  spend: number;
  revenue: number; // Shopify net revenue
  mer: number;
  contributionMargin: number;
  breakeven: number;
}

type SheetRow = { month: string; cost: number };

export default function OverallMerPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");

  const [googleRaw, setGoogleRaw] = useState<GoogleMonth[]>([]);
  const [bingRaw, setBingRaw] = useState<SheetRow[]>([]);
  const [metaRaw, setMetaRaw] = useState<SheetRow[]>([]);
  const [amazonRaw, setAmazonRaw] = useState<SheetRow[]>([]);
  const [connexityRaw, setConnexityRaw] = useState<SheetRow[]>([]);
  const [pinterestRaw, setPinterestRaw] = useState<SheetRow[]>([]);
  const [tiktokRaw, setTiktokRaw] = useState<SheetRow[]>([]);
  const [shopifyRevenue, setShopifyRevenue] = useState<ShopifyMonth[]>([]);

  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // One-shot fetch for spend; Shopify revenue refetches on range change.
  useEffect(() => {
    const year = new Date().getFullYear();
    const prevYear = year - 1;
    const errs: string[] = [];

    Promise.allSettled([
      fetch(
        `/api/google-ads/campaigns?start=${prevYear}-01-01&end=${year}-12-31`
      )
        .then((r) => r.json())
        .then((d) => {
          if (d.error) throw new Error(`google: ${d.error}`);
          setGoogleRaw(Array.isArray(d) ? d : []);
        }),
      fetch("/api/sheets/bing").then((r) => r.json()).then((d) => {
        if (d.error) throw new Error(`bing: ${d.error}`);
        setBingRaw(d.rows ?? []);
      }),
      fetch("/api/sheets/meta").then((r) => r.json()).then((d) => {
        if (d.error) throw new Error(`meta: ${d.error}`);
        setMetaRaw(d.rows ?? []);
      }),
      fetch("/api/sheets/amazon-ads").then((r) => r.json()).then((d) => {
        if (d.error) throw new Error(`amazon: ${d.error}`);
        setAmazonRaw(d.rows ?? []);
      }),
      fetch("/api/sheets/connexity").then((r) => r.json()).then((d) => {
        if (d.error) throw new Error(`connexity: ${d.error}`);
        setConnexityRaw(d.rows ?? []);
      }),
      fetch("/api/sheets/pinterest").then((r) => r.json()).then((d) => {
        if (d.error) throw new Error(`pinterest: ${d.error}`);
        setPinterestRaw(d.rows ?? []);
      }),
      fetch("/api/sheets/tiktok").then((r) => r.json()).then((d) => {
        if (d.error) throw new Error(`tiktok: ${d.error}`);
        setTiktokRaw(d.rows ?? []);
      }),
    ]).then((results) => {
      for (const r of results) {
        if (r.status === "rejected") {
          errs.push(r.reason?.message ?? "Unknown source error");
        }
      }
      setErrors(errs);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const { start, end } = getRange(rangeKey);
    fetch(`/api/shopify/channel-sales?start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error && Array.isArray(d.monthly)) {
          setShopifyRevenue(
            d.monthly.map((m: { date: string; netSales: number; totalSales: number }) => ({
              month: m.date,
              netSales: m.netSales,
              totalSales: m.totalSales,
            }))
          );
        }
      })
      .catch(() => {});
  }, [rangeKey]);

  const range = getRange(rangeKey);

  const monthlyRows = useMemo((): MonthRow[] => {
    const spend: Record<string, number> = {};
    function inRange(month: string) {
      return month >= range.startYM && month <= range.endYM;
    }
    function add(rows: { month: string; cost?: number; totalSpend?: number }[]) {
      for (const r of rows) {
        if (!inRange(r.month)) continue;
        spend[r.month] = (spend[r.month] ?? 0) + (r.cost ?? r.totalSpend ?? 0);
      }
    }
    add(googleRaw.map((g) => ({ month: g.month, cost: g.totalSpend })));
    add(bingRaw);
    add(metaRaw);
    add(amazonRaw);
    add(connexityRaw);
    add(pinterestRaw);
    add(tiktokRaw);

    const revenueByMonth: Record<string, number> = {};
    for (const r of shopifyRevenue) revenueByMonth[r.month] = r.netSales;

    const months = new Set<string>([
      ...Object.keys(spend),
      ...Object.keys(revenueByMonth),
    ]);

    return Array.from(months)
      .map((month) => {
        const s = spend[month] ?? 0;
        const rev = revenueByMonth[month] ?? 0;
        return {
          month,
          spend: s,
          revenue: rev,
          mer: s > 0 ? rev / s : 0,
          contributionMargin: rev * PROFIT_MARGIN - s,
          breakeven: s > 0 ? s / PROFIT_MARGIN : 0,
        };
      })
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [
    googleRaw,
    bingRaw,
    metaRaw,
    amazonRaw,
    connexityRaw,
    pinterestRaw,
    tiktokRaw,
    shopifyRevenue,
    range.startYM,
    range.endYM,
  ]);

  const totalSpend = monthlyRows.reduce((s, m) => s + m.spend, 0);
  const totalRevenue = monthlyRows.reduce((s, m) => s + m.revenue, 0);
  const totalMER = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const totalCM = totalRevenue * PROFIT_MARGIN - totalSpend;
  const totalBreakeven = totalSpend > 0 ? totalSpend / PROFIT_MARGIN : 0;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Overall MER & Profitability</h1>
          <p className="text-gray-400 mt-1 max-w-2xl">
            Blended Marketing Efficiency Ratio across every paid channel —
            Shopify net revenue divided by total ad spend (Google + Meta + Bing
            + Pinterest + Amazon + Connexity + TikTok).
          </p>
          <div className="mt-2 inline-flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
            <span className="text-gray-400 text-xs">Profit margin assumption:</span>
            <span className="text-white text-xs font-semibold">
              {(PROFIT_MARGIN * 100).toFixed(0)}%
            </span>
            <span className="text-gray-500 text-xs">(after COGS & fulfillment)</span>
          </div>
        </div>
        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {loading && <div className="text-gray-400 mb-6">Loading…</div>}
      {errors.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4 mb-6 text-sm text-yellow-300">
          Some sources failed to load — totals may be incomplete:
          <ul className="list-disc list-inside mt-1 text-xs">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <Card label="Total Ad Spend" value={fmtC(totalSpend)} />
            <Card label="Shopify Net Revenue" value={fmtC(totalRevenue)} />
            <Card
              label="Blended MER"
              value={totalMER > 0 ? `${totalMER.toFixed(2)}x` : "—"}
              accent={merColor(totalMER)}
            />
            <Card
              label="Contribution Margin"
              value={fmtC(totalCM)}
              accent={totalCM >= 0 ? "text-green-400" : "text-red-400"}
              sub="Rev × 40% − Spend"
            />
            <Card
              label="Breakeven Revenue"
              value={fmtC(totalBreakeven)}
              sub="Spend ÷ 40%"
            />
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              How it&apos;s calculated
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <Formula
                name="Blended MER"
                formula="Shopify Net Revenue ÷ Total Ad Spend"
                note="Every dollar of revenue divided by every ad dollar, regardless of channel"
              />
              <Formula
                name="Contribution Margin"
                formula="(Revenue × 40%) − Ad Spend"
                note="Estimated profit after COGS, fulfillment, and ads"
              />
              <Formula
                name="Breakeven Revenue"
                formula="Ad Spend ÷ 40%"
                note="Revenue needed to cover ads at 40% margin"
              />
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">
                Monthly Breakdown — {range.label}
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/50 border-b border-gray-800">
                  <th className="py-3 px-4 text-left">Month</th>
                  <th className="py-3 px-4 text-right">Ad Spend</th>
                  <th className="py-3 px-4 text-right">Net Revenue</th>
                  <th className="py-3 px-4 text-right">MER</th>
                  <th className="py-3 px-4 text-right">Breakeven Rev.</th>
                  <th className="py-3 px-4 text-right">vs Breakeven</th>
                  <th className="py-3 px-4 text-right">Contribution Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {monthlyRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500">
                      No data for this period
                    </td>
                  </tr>
                ) : (
                  monthlyRows.map((m) => {
                    const vsBreakeven = m.revenue - m.breakeven;
                    return (
                      <tr
                        key={m.month}
                        className="text-gray-300 hover:bg-gray-800/40"
                      >
                        <td className="py-3 px-4 font-medium text-white">{m.month}</td>
                        <td className="py-3 px-4 text-right">{fmtC(m.spend)}</td>
                        <td className="py-3 px-4 text-right text-blue-300">
                          {fmtC(m.revenue)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-semibold ${merColor(
                            m.mer
                          )}`}
                        >
                          {m.mer > 0 ? `${m.mer.toFixed(2)}x` : "—"}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-400">
                          {fmtC(m.breakeven)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-medium ${
                            vsBreakeven >= 0 ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {m.breakeven > 0
                            ? (vsBreakeven >= 0 ? "+" : "") + fmtC(vsBreakeven)
                            : "—"}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-semibold ${
                            m.contributionMargin >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {m.spend > 0 ? fmtC(m.contributionMargin) : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {monthlyRows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-800/50 border-t border-gray-700 text-xs font-semibold text-gray-300">
                    <td className="py-3 px-4 text-gray-400">Total</td>
                    <td className="py-3 px-4 text-right">{fmtC(totalSpend)}</td>
                    <td className="py-3 px-4 text-right text-blue-300">
                      {fmtC(totalRevenue)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-bold ${merColor(
                        totalMER
                      )}`}
                    >
                      {totalMER > 0 ? `${totalMER.toFixed(2)}x` : "—"}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-400">
                      {fmtC(totalBreakeven)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-bold ${
                        totalRevenue - totalBreakeven >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {totalBreakeven > 0
                        ? (totalRevenue - totalBreakeven >= 0 ? "+" : "") +
                          fmtC(totalRevenue - totalBreakeven)
                        : "—"}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-bold ${
                        totalCM >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {fmtC(totalCM)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  accent = "text-white",
  sub,
}: {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-xl font-bold ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function Formula({
  name,
  formula,
  note,
}: {
  name: string;
  formula: string;
  note: string;
}) {
  return (
    <div>
      <span className="text-white font-medium">{name}</span>
      <span className="text-gray-400"> = {formula}</span>
      <p className="text-xs text-gray-600 mt-1">{note}</p>
    </div>
  );
}
