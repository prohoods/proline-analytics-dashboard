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

export interface ZoneRow {
  zip3: string;
  state: string;
  shipments: number;
  totalCost: number;
  avgCost: number;
}

export function ShippingProjections({
  data,
  cogsBySku,
  zones,
}: {
  data: ProjectionsData;
  cogsBySku: Record<string, number | null>;
  zones: ZoneRow[];
}) {
  const [open, setOpen] = useState(true);
  const [skuQuery, setSkuQuery] = useState("");
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [zipInput, setZipInput] = useState("");
  const [submittedZip, setSubmittedZip] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [marginOpen, setMarginOpen] = useState(false);
  const [expandedState, setExpandedState] = useState<string | null>(null);

  const selected = data.catalog.find(c => c.sku === selectedSku);

  // Derive state from a typed/submitted ZIP via the zoneBreakdown rollup.
  // We accept a 3+ digit input, take the first 3, and look up the matching
  // ZIP3 row (it carries the state code).
  const zip3 = submittedZip.replace(/\D/g, "").slice(0, 3);
  const matchedZone = useMemo(
    () => (zip3.length === 3 ? zones.find(z => z.zip3 === zip3) ?? null : null),
    [zip3, zones],
  );
  const matchedState = matchedZone?.state ?? "";

  const stateRow = matchedState ? data.stateAvgs.find(s => s.state === matchedState) : undefined;
  const catNational = data.categoryAvgs.find(c => c.category === selected?.category);

  // Fallback chain: state × category (≥3 shipments) → national category →
  // ZIP3 blended avg → overall avg. We surface which one was used so the
  // user can sanity-check thin estimates.
  const estimate = useMemo(() => {
    if (!selected && !matchedZone) return null;
    if (selected) {
      const stateCat = stateRow?.byCategory.find(c => c.category === selected.category);
      if (stateCat && stateCat.shipments >= 3) {
        return {
          value: stateCat.avgCost,
          source: `${STATE_NAMES[stateRow!.state] ?? stateRow!.state} · ${selected.category} avg`,
          shipments: stateCat.shipments,
          confidence: "high" as const,
        };
      }
      if (catNational && catNational.shipments > 0) {
        return {
          value: catNational.avgCost,
          source: `national avg for ${selected.category}`,
          shipments: catNational.shipments,
          confidence: matchedState ? ("medium" as const) : ("medium" as const),
        };
      }
    }
    if (matchedZone && matchedZone.shipments > 0) {
      return {
        value: matchedZone.avgCost,
        source: `${zip3}xx ZIP3 blended avg`,
        shipments: matchedZone.shipments,
        confidence: "low" as const,
      };
    }
    if (data.grandAvgPerShipment > 0) {
      return {
        value: data.grandAvgPerShipment,
        source: "overall avg (no SKU/ZIP context)",
        shipments: data.grandTotalShipments,
        confidence: "low" as const,
      };
    }
    return null;
  }, [selected, matchedZone, stateRow, catNational, data, zip3, matchedState]);

  // SKU search results — limit to 20 by units sold.
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
    const ship = estimate?.value ?? 0;
    const trueProfit = grossProfit - ship;
    return {
      price, cogs, grossProfit,
      grossMargin: (grossProfit / price) * 100,
      ship, trueProfit,
      trueMargin: (trueProfit / price) * 100,
    };
  }, [selected, cogs, estimate]);

  // Group ZIP3s under their parent state for the browse drawer.
  const zonesByState = useMemo(() => {
    const m = new Map<string, ZoneRow[]>();
    for (const z of zones) {
      const key = z.state || "??";
      const arr = m.get(key) ?? [];
      arr.push(z);
      m.set(key, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => b.shipments - a.shipments);
    return Array.from(m.entries()).sort((a, b) => {
      const aS = a[1].reduce((s, r) => s + r.shipments, 0);
      const bS = b[1].reduce((s, r) => s + r.shipments, 0);
      return bS - aS;
    });
  }, [zones]);

  const submitZip = () => setSubmittedZip(zipInput);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-4 border-b border-gray-800 flex items-center justify-between hover:bg-gray-800/40 transition-colors"
      >
        <div className="text-left">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-white">Shipping projections & estimator</div>
            <span className="text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5">
              Ground shipping only
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            Trailing 30 days: {data.windowStart} → {data.windowEnd}. Run-rate forecast + per-product/ZIP cost estimator.
          </div>
        </div>
        <span className="text-gray-500 text-xs">{open ? "▾ Hide" : "▸ Show"}</span>
      </button>

      {open && (
        <>
          {/* Forecast summary */}
          <div className="px-5 py-4 border-b border-gray-800 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Trailing 30-day spend</div>
              <div className="text-2xl font-bold text-white mt-1">{fmt(data.grandTotalCost)}</div>
              <div className="text-xs text-gray-600 mt-1">{fmtN(data.grandTotalShipments)} shipments</div>
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

          {/* Estimator */}
          <div className="px-5 py-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Cost-to-ship estimator</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Inputs */}
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
                <div className="border border-gray-800 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
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
                  <label className="text-xs text-gray-500">Destination ZIP code</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      value={zipInput}
                      onChange={e => setZipInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") submitZip(); }}
                      placeholder="e.g. 77001 (or 770)"
                      inputMode="numeric"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={submitZip}
                      className="px-3 py-2 rounded-lg text-xs border bg-blue-600/20 border-blue-600/40 text-blue-200 hover:bg-blue-600/30"
                    >
                      Estimate
                    </button>
                    <button
                      onClick={() => setBrowseOpen(v => !v)}
                      className={`px-3 py-2 rounded-lg text-xs border ${browseOpen ? "bg-blue-600/20 border-blue-600/40 text-blue-300" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"}`}
                      title="Browse ZIPs by state"
                    >
                      Browse ▾
                    </button>
                  </div>
                  {submittedZip && !matchedZone && zip3.length === 3 && (
                    <div className="text-[11px] text-amber-300 mt-1">No shipments to {zip3}xx in the trailing 30 days.</div>
                  )}
                  {matchedZone && (
                    <div className="text-[11px] text-gray-500 mt-1">
                      {zip3}xx · {STATE_NAMES[matchedZone.state] ?? matchedZone.state} · {fmtN(matchedZone.shipments)} shipments observed
                    </div>
                  )}
                </div>

                {browseOpen && (
                  <div className="border border-gray-800 rounded-lg max-h-72 overflow-y-auto bg-gray-950/40">
                    {zonesByState.map(([st, list]) => {
                      const totalShip = list.reduce((s, r) => s + r.shipments, 0);
                      const isOpen = expandedState === st;
                      return (
                        <div key={st} className="border-b border-gray-800 last:border-b-0">
                          <button
                            onClick={() => setExpandedState(isOpen ? null : st)}
                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-800/60"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 text-xs w-3">{isOpen ? "▾" : "▸"}</span>
                              <span className="font-mono text-blue-400 text-xs font-semibold">{st}</span>
                              <span className="text-gray-400 text-xs">{STATE_NAMES[st] ?? st}</span>
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {list.length} ZIP3 · {fmtN(totalShip)} shipments
                            </div>
                          </button>
                          {isOpen && (
                            <div className="bg-gray-900/40">
                              {list.map(z => (
                                <button
                                  key={z.zip3}
                                  onClick={() => { setZipInput(`${z.zip3}00`); setSubmittedZip(`${z.zip3}00`); }}
                                  className="w-full flex items-center justify-between px-8 py-1.5 text-xs hover:bg-gray-800/60 border-t border-gray-900"
                                >
                                  <span className="font-mono text-blue-300">{z.zip3}xx</span>
                                  <span className="text-gray-500">
                                    {fmtN(z.shipments)} shipments · avg {fmt2(z.avgCost)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {zonesByState.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs text-gray-600">No ZIP data.</div>
                    )}
                  </div>
                )}
              </div>

              {/* Result */}
              <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-4">
                {!selected && !matchedZone ? (
                  <div className="text-sm text-gray-500 h-full flex items-center justify-center text-center px-4">
                    Pick a SKU and/or enter a destination ZIP, then hit Estimate.
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    {selected && (
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Product</div>
                        <div className="font-mono text-blue-400">{selected.sku}</div>
                        <div className="text-gray-300 text-xs mt-0.5">{selected.title}</div>
                      </div>
                    )}
                    {matchedZone && (
                      <div className={selected ? "border-t border-gray-800 pt-3" : ""}>
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Destination</div>
                        <div className="text-gray-300 text-xs mt-0.5">
                          <span className="font-mono text-blue-400">{zip3}xx</span> · {STATE_NAMES[matchedZone.state] ?? matchedZone.state}
                        </div>
                      </div>
                    )}

                    <div className={selected || matchedZone ? "border-t border-gray-800 pt-3" : ""}>
                      <div className="text-xs text-gray-500 uppercase tracking-wide">Estimated shipping cost</div>
                      {estimate ? (
                        <>
                          <div className="text-2xl font-bold text-white mt-1">{fmt2(estimate.value)}</div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            Based on {estimate.source} · {fmtN(estimate.shipments)} shipments
                          </div>
                          {estimate.confidence === "low" && (
                            <div className="text-[11px] text-amber-300 mt-1">Low confidence — sparse data.</div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-gray-500 mt-1">Not enough data to estimate.</div>
                      )}
                    </div>

                    {selected && (
                      <div className="border-t border-gray-800 pt-3">
                        <button
                          onClick={() => setMarginOpen(v => !v)}
                          className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-white"
                        >
                          <span className="uppercase tracking-wide">Margin after shipping</span>
                          <span>{marginOpen ? "▾ Hide" : "▸ Show"}</span>
                        </button>
                        {marginOpen && (
                          margin ? (
                            <div className="space-y-1 mt-2">
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
                            <div className="mt-2 text-xs text-gray-500">
                              No COGS on file for this SKU — margin can&apos;t be computed. Add it to <code className="text-gray-400">src/lib/cogs.ts</code> to enable.
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
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
