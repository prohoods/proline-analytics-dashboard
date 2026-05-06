"use client";

import { useEffect, useMemo, useState } from "react";
import { STATE_NAMES } from "@/lib/state-fips";
import type { ProductCategory } from "@/lib/categories";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("en-US").format(n);
const fmtPct = (n: number) => n.toFixed(1) + "%";

interface CatalogRow {
  sku: string;
  title: string;
  category: ProductCategory;
  price: number;
  units: number;
  revenue: number;
}

interface StateAvgRow {
  state: string;
  shipments: number;
  totalCost: number;
  avgCost: number;
  byCategory: { category: ProductCategory; shipments: number; avgCost: number }[];
}

interface CategoryAvgRow {
  category: ProductCategory;
  shipments: number;
  avgCost: number;
}

export interface ProjectionsData {
  windowStart: string;
  windowEnd: string;
  windowDays: number;
  grandTotalCost: number;
  grandTotalShipments: number;
  grandAvgPerShipment: number;
  projectedNext30Days: number;
  stateAvgs: StateAvgRow[];
  categoryAvgs: CategoryAvgRow[];
  catalog: CatalogRow[];
}

export function ShippingProjections({ data, cogsBySku }: { data: ProjectionsData; cogsBySku: Record<string, number | null> }) {
  // Per-product calculator state
  const [skuQuery, setSkuQuery] = useState("");
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [destState, setDestState] = useState<string>("");

  const selected = data.catalog.find(c => c.sku === selectedSku);
  const stateRow = data.stateAvgs.find(s => s.state === destState);
  const catNational = data.categoryAvgs.find(c => c.category === selected?.category);

  // Estimated shipping cost: prefer state×category, fall back to category
  // national avg, then overall.
  const estimatedShipping = useMemo(() => {
    if (!selected) return null;
    const stateCat = stateRow?.byCategory.find(c => c.category === selected.category);
    if (stateCat && stateCat.shipments >= 3) return { value: stateCat.avgCost, source: `${stateRow!.state} · ${selected.category} avg (${stateCat.shipments} shipments)` };
    if (catNational && catNational.shipments > 0) return { value: catNational.avgCost, source: `national ${selected.category} avg (${catNational.shipments} shipments)` };
    if (data.grandAvgPerShipment > 0) return { value: data.grandAvgPerShipment, source: "overall avg" };
    return null;
  }, [selected, stateRow, catNational, data.grandAvgPerShipment]);

  // SKU search results — limit to top 30 matches sorted by units sold
  const searchResults = useMemo(() => {
    const q = skuQuery.trim().toLowerCase();
    if (!q) return data.catalog.slice(0, 20);
    return data.catalog
      .filter(c => c.sku.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      .slice(0, 20);
  }, [skuQuery, data.catalog]);

  const cogs = selected ? cogsBySku[selected.sku] ?? null : null;
  const margin = useMemo(() => {
    if (!selected) return null;
    const price = selected.price;
    if (!price || !cogs) return null;
    const grossProfit = price - cogs;
    const ship = estimatedShipping?.value ?? 0;
    const trueProfit = grossProfit - ship;
    return {
      price,
      cogs,
      grossProfit,
      grossMargin: (grossProfit / price) * 100,
      ship,
      trueProfit,
      trueMargin: (trueProfit / price) * 100,
    };
  }, [selected, cogs, estimatedShipping]);

  // Useful state list for the dropdown — only states with shipments
  const stateOptions = data.stateAvgs.filter(s => s.shipments > 0).sort((a, b) => b.shipments - a.shipments);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-white">Shipping projections</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Trailing 30 days: {data.windowStart} → {data.windowEnd}. Run-rate baseline for forecasts and per-product estimates.
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5">
          Ground shipping only
        </span>
      </div>

      {/* 1. Monthly forecast */}
      <div className="px-5 py-4 border-b border-gray-800 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Trailing 30-day spend</div>
          <div className="text-2xl font-bold text-white mt-1">{fmt(data.grandTotalCost)}</div>
          <div className="text-xs text-gray-600 mt-1">{fmtN(data.grandTotalShipments)} shipments · {fmt2(data.grandAvgPerShipment)} avg</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Projected next 30 days</div>
          <div className="text-2xl font-bold text-blue-300 mt-1">{fmt(data.projectedNext30Days)}</div>
          <div className="text-xs text-gray-600 mt-1">At current run-rate (no seasonality)</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Annualized</div>
          <div className="text-2xl font-bold text-white mt-1">{fmt(data.projectedNext30Days * 12)}</div>
          <div className="text-xs text-gray-600 mt-1">Trailing-30 × 12</div>
        </div>
      </div>

      {/* 2. Per-product cost-to-ship + 3. margin-after-shipping */}
      <div className="px-5 py-4">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Per-product shipping calculator</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Picker */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Search a SKU or product name</label>
              <input
                value={skuQuery}
                onChange={e => setSkuQuery(e.target.value)}
                placeholder="e.g. PLFW 750.36 or 'wall mount'"
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="border border-gray-800 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              {searchResults.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-gray-600">No matches.</div>
              )}
              {searchResults.map(c => (
                <button
                  key={c.sku}
                  onClick={() => setSelectedSku(c.sku)}
                  className={`w-full px-3 py-2 text-left text-xs border-b border-gray-800 last:border-b-0 hover:bg-gray-800/60 ${selectedSku === c.sku ? "bg-blue-600/15" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-blue-400 truncate">{c.sku}</span>
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                      c.category === "Range Hood" ? "bg-blue-500/15 text-blue-300 border-blue-500/30" :
                      c.category === "Parts" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" :
                      "bg-gray-700/40 text-gray-300 border-gray-600"
                    }`}>{c.category}</span>
                  </div>
                  <div className="text-gray-500 truncate mt-0.5">{c.title}</div>
                  <div className="text-gray-600 mt-0.5">{fmtN(c.units)} units · avg {fmt2(c.price)}</div>
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-gray-500">Destination state</label>
              <select
                value={destState}
                onChange={e => setDestState(e.target.value)}
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">— pick a state to refine the estimate —</option>
                {stateOptions.map(s => (
                  <option key={s.state} value={s.state}>
                    {STATE_NAMES[s.state] ?? s.state} · {fmtN(s.shipments)} shipments · {fmt2(s.avgCost)} avg
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Result */}
          <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-4">
            {!selected ? (
              <div className="text-sm text-gray-500 h-full flex items-center justify-center text-center">
                Pick a product to see expected shipping cost and margin after shipping.
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Selected</div>
                  <div className="font-mono text-blue-400">{selected.sku}</div>
                  <div className="text-gray-300 text-xs mt-0.5">{selected.title}</div>
                </div>

                <div className="border-t border-gray-800 pt-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Estimated shipping cost</div>
                  {estimatedShipping ? (
                    <>
                      <div className="text-2xl font-bold text-white mt-1">{fmt2(estimatedShipping.value)}</div>
                      <div className="text-xs text-gray-600 mt-0.5">Source: {estimatedShipping.source}</div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-500 mt-1">Not enough data to estimate.</div>
                  )}
                </div>

                {margin ? (
                  <div className="border-t border-gray-800 pt-3 space-y-1">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Margin after shipping</div>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Avg sale price</span><span className="text-white">{fmt2(margin.price)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">COGS (landed)</span><span className="text-white">{fmt2(margin.cogs)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Gross profit</span><span className="text-white">{fmt2(margin.grossProfit)} <span className="text-gray-600">({fmtPct(margin.grossMargin)})</span></span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">− Shipping</span><span className="text-rose-400">{fmt2(margin.ship)}</span></div>
                    <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-800 mt-2">
                      <span className="text-gray-400">True profit</span>
                      <span className={margin.trueProfit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {fmt2(margin.trueProfit)} <span className="text-xs text-gray-600 font-normal">({fmtPct(margin.trueMargin)})</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-gray-800 pt-3 text-xs text-gray-500">
                    No COGS on file for this SKU — margin can't be computed. Add it to <code className="text-gray-400">src/lib/cogs.ts</code> to enable.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper hook so the page can fetch the trailing-30 projections endpoint
// without re-running on every page rerender. Returns null while loading.
export function useShippingProjections() {
  const [data, setData] = useState<ProjectionsData | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shopify/projections")
      .then(r => r.json())
      .then(d => { if (!cancelled) { if (d.error) setError(d.error); else setData(d); } })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  return { data, error };
}
