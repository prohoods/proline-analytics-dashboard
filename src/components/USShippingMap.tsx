"use client";

import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { useMemo, useState } from "react";
import { FIPS_TO_STATE, STATE_NAMES } from "@/lib/state-fips";

// us-atlas topojson — fetched from CDN at runtime, not bundled. ~50KB load
// on first paint of the page; cached afterwards.
const TOPO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("en-US").format(n);

// Linear interpolator from cheap (emerald) → expensive (rose). I picked these
// to match the rest of the dashboard's red/green delta convention.
function interpolateCost(t: number): string {
  // t in [0, 1]
  const cheap = [16, 185, 129];   // emerald-500
  const mid =   [234, 179, 8];    // amber-500
  const pricey = [244, 63, 94];   // rose-500
  let r, g, b;
  if (t < 0.5) {
    const k = t * 2;
    r = Math.round(cheap[0] + (mid[0] - cheap[0]) * k);
    g = Math.round(cheap[1] + (mid[1] - cheap[1]) * k);
    b = Math.round(cheap[2] + (mid[2] - cheap[2]) * k);
  } else {
    const k = (t - 0.5) * 2;
    r = Math.round(mid[0] + (pricey[0] - mid[0]) * k);
    g = Math.round(mid[1] + (pricey[1] - mid[1]) * k);
    b = Math.round(mid[2] + (pricey[2] - mid[2]) * k);
  }
  return `rgb(${r}, ${g}, ${b})`;
}

export interface MapStateData {
  state: string;
  avgCost: number;
  shipments: number;
}

export interface MapStateTotals {
  yearStart: string;
  monthStart: string;
  asOf: string;
  states: { state: string; ytdSpend: number; ytdShipments: number; mtdSpend: number; mtdShipments: number }[];
}

const fmt0 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function USShippingMap({
  data,
  metric,
  emptyColor = "#1f2937",
  stateTotals,
  onSelectState,
}: {
  data: MapStateData[];
  metric: "avgCost" | "shipments";
  emptyColor?: string;
  stateTotals?: MapStateTotals | null;
  onSelectState?: (state: string) => void;
}) {
  const [hover, setHover] = useState<{ state: string; x: number; y: number } | null>(null);

  const byState = useMemo(() => {
    const m = new Map<string, MapStateData>();
    for (const d of data) m.set(d.state, d);
    return m;
  }, [data]);

  const totalsByState = useMemo(() => {
    const m = new Map<string, MapStateTotals["states"][number]>();
    if (stateTotals) for (const s of stateTotals.states) m.set(s.state, s);
    return m;
  }, [stateTotals]);

  // Normalize the metric so the color scale isn't dominated by a single
  // outlier state. Clamp to the 5th–95th percentile for the scale; outliers
  // still show, they just bucket to the extreme color.
  const { lo, hi } = useMemo(() => {
    const values = data.map(d => d[metric]).filter(v => v > 0).sort((a, b) => a - b);
    if (values.length === 0) return { lo: 0, hi: 1 };
    const p = (q: number) => values[Math.max(0, Math.min(values.length - 1, Math.floor(values.length * q)))];
    return { lo: p(0.05), hi: p(0.95) || values[values.length - 1] };
  }, [data, metric]);

  const colorFor = (v: number) => {
    if (v <= 0) return emptyColor;
    const t = Math.max(0, Math.min(1, (v - lo) / Math.max(1e-9, hi - lo)));
    return interpolateCost(t);
  };

  return (
    <div className="relative">
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1000 }}
        width={800}
        height={460}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={TOPO_URL}>
          {({ geographies }) =>
            geographies.map(geo => {
              const fips = String(geo.id).padStart(2, "0");
              const code = FIPS_TO_STATE[fips];
              const d = code ? byState.get(code) : undefined;
              const value = d ? d[metric] : 0;
              const fill = colorFor(value);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="#0a0a0a"
                  strokeWidth={0.5}
                  onMouseEnter={e => {
                    if (!code) return;
                    const rect = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement | null)?.getBoundingClientRect();
                    setHover({
                      state: code,
                      x: rect ? e.clientX - rect.left : e.clientX,
                      y: rect ? e.clientY - rect.top : e.clientY,
                    });
                  }}
                  onMouseMove={e => {
                    if (!code) return;
                    const rect = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement | null)?.getBoundingClientRect();
                    setHover({
                      state: code,
                      x: rect ? e.clientX - rect.left : e.clientX,
                      y: rect ? e.clientY - rect.top : e.clientY,
                    });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => { if (code && onSelectState) onSelectState(code); }}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill, opacity: 0.85, cursor: onSelectState ? "pointer" : "default" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {hover && (() => {
        const d = byState.get(hover.state);
        const t = totalsByState.get(hover.state);
        return (
          <div
            className="absolute pointer-events-none bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg z-10"
            style={{ left: hover.x + 10, top: hover.y + 10 }}
          >
            <div className="text-white font-semibold">{STATE_NAMES[hover.state] ?? hover.state}</div>
            {d ? (
              <>
                <div className="text-gray-400 mt-0.5">Avg / shipment: <span className="text-white">{fmt2(d.avgCost)}</span></div>
                <div className="text-gray-400">Shipments: <span className="text-white">{fmtN(d.shipments)}</span></div>
              </>
            ) : (
              <div className="text-gray-500 mt-0.5">No data in range</div>
            )}
            {t && (
              <>
                <div className="border-t border-gray-800 mt-1.5 pt-1.5 text-gray-400">YTD: <span className="text-white">{fmt0(t.ytdSpend)}</span> <span className="text-gray-600">({fmtN(t.ytdShipments)})</span></div>
                <div className="text-gray-400">MTD: <span className="text-white">{fmt0(t.mtdSpend)}</span> <span className="text-gray-600">({fmtN(t.mtdShipments)})</span></div>
              </>
            )}
            {onSelectState && (
              <div className="text-gray-600 mt-1 italic">Click for full breakdown</div>
            )}
          </div>
        );
      })()}

      <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
        <span>Cheaper</span>
        <div className="flex-1 h-2 rounded" style={{
          background: `linear-gradient(to right, ${interpolateCost(0)}, ${interpolateCost(0.5)}, ${interpolateCost(1)})`
        }} />
        <span>Pricier</span>
        <span className="ml-2 text-gray-600">·</span>
        <span className="text-gray-600">{fmt2(lo)} – {fmt2(hi)}</span>
      </div>
    </div>
  );
}

