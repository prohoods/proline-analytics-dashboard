"use client";

import { useState } from "react";
import {
  PL_GROUPS,
  CATEGORY_TEXT,
  type MonthData,
  type PLGroupKey,
} from "@/lib/financial-data";
import { useFinancialData } from "@/lib/use-financial-data";
import type { RangeKey } from "@/lib/date-ranges";
import CategoryDrillDown from "@/components/CategoryDrillDown";
import DateRangeDropdown from "@/components/DateRangeDropdown";
import InfoTooltip from "@/components/InfoTooltip";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function pct(n: number, base: number) {
  if (base === 0) return "—";
  return `${((n / base) * 100).toFixed(1)}%`;
}

export default function FinancialReportingPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const { statements, monthRevenue, sumGroup, sumCategory, range } = useFinancialData(rangeKey);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const hasData = statements.length > 0;
  const activeMonths: MonthData[] = statements;
  const activeMonth: MonthData | undefined = activeMonths.length === 1 ? activeMonths[0] : undefined;
  const periodLabel = range.label;

  // Compute totals — sum across the active months
  const revenue = activeMonths.reduce((s, m) => s + monthRevenue(m), 0);

  function groupTotal(key: PLGroupKey): number {
    return activeMonth ? sumGroup(key, activeMonth) : PL_GROUPS[key].reduce((s, c) => s + sumCategory(c), 0);
  }
  function categoryTotal(cat: string): number {
    return activeMonth ? sumCategory(cat, activeMonth) : sumCategory(cat);
  }

  const cogs = groupTotal("COGS");
  const grossProfit = revenue - cogs;
  const marketingOpex = groupTotal("OpEx — Marketing");
  const personnelOpex = groupTotal("OpEx — Personnel");
  const facilitiesOpex = groupTotal("OpEx — Facilities & Logistics");
  const gaOpex = groupTotal("OpEx — G&A");
  const totalOpex = marketingOpex + personnelOpex + facilitiesOpex + gaOpex;
  const operatingIncome = grossProfit - totalOpex;
  const belowLine = groupTotal("Below the Line");
  const unclassified = groupTotal("Unclassified (Pending)");
  const netIncome = operatingIncome - belowLine - unclassified;

  const grossMargin = revenue === 0 ? 0 : (grossProfit / revenue) * 100;
  const opMargin = revenue === 0 ? 0 : (operatingIncome / revenue) * 100;
  const netMargin = revenue === 0 ? 0 : (netIncome / revenue) * 100;

  return (
    <div className="p-6 space-y-6">
      <CategoryDrillDown category={drillCategory} statements={statements} month={activeMonth} rangeLabel={range.label} onClose={() => setDrillCategory(null)} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center text-xl">📊</div>
          <div>
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-white">Financial Reporting</h1>
              <InfoTooltip title="Financial Reporting">
                <p className="mb-2">This is the company&apos;s <strong>Profit &amp; Loss statement</strong> — the standard CFO/board view of how the business performed in a period.</p>
                <p className="mb-2">It&apos;s organized top-down: <strong>Revenue → COGS → Gross Profit → OpEx → Operating Income → Net Income</strong>. Each layer subtracts a category of cost so you can see exactly where money is going. Use the date dropdown to change the period.</p>
                <p>This is <em>cash-basis</em> — built from actual bank movements, not invoices. So &quot;revenue&quot; means cash received, not orders booked.</p>
              </InfoTooltip>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">Cash-basis P&amp;L — {periodLabel}</p>
          </div>
        </div>

        <DateRangeDropdown value={rangeKey} onChange={setRangeKey} />
      </div>

      {!hasData && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
          No statements in this period yet. Upload a bank statement on the <a href="/finance/upload" className="text-blue-400 hover:underline">upload page</a>, or pick a different range.
        </div>
      )}

      {/* Margin summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MarginCard label="Revenue" value={fmt(revenue)} sub="Cash deposits to …0115" color="text-green-400" />
        <MarginCard label="Gross Margin" value={`${grossMargin.toFixed(1)}%`} sub={`${fmt(grossProfit)} after COGS`} color={grossMargin >= 40 ? "text-emerald-400" : grossMargin >= 25 ? "text-yellow-400" : "text-red-400"} />
        <MarginCard label="Operating Margin" value={`${opMargin.toFixed(1)}%`} sub={`${fmt(operatingIncome)} after OpEx`} color={opMargin >= 10 ? "text-emerald-400" : opMargin >= 0 ? "text-yellow-400" : "text-red-400"} />
        <MarginCard label="Net Margin" value={`${netMargin.toFixed(1)}%`} sub={`${fmt(netIncome)} after all costs`} color={netMargin >= 0 ? "text-emerald-400" : "text-red-400"} />
      </div>

      {/* P&L statement */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Profit &amp; Loss — {periodLabel}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Click any category to see underlying transactions</p>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-yellow-400 bg-yellow-900/30 border border-yellow-800/40 rounded-full px-2 py-0.5">
            Cash basis
          </span>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2.5 px-4 text-left">Line Item</th>
              <th className="py-2.5 px-4 text-right">Amount</th>
              <th className="py-2.5 px-4 text-right">% Revenue</th>
            </tr>
          </thead>
          <tbody>
            {/* Revenue */}
            <RevenueRow revenue={revenue} />
            <SpacerRow />

            {/* COGS */}
            <SectionHeader label="Cost of Goods Sold" />
            {PL_GROUPS.COGS.map(cat => {
              const amt = categoryTotal(cat);
              if (!amt) return null;
              return <CategoryRow key={cat} category={cat} amount={amt} base={revenue} onClick={() => setDrillCategory(cat)} />;
            })}
            <SubtotalRow label="Total COGS" amount={cogs} base={revenue} sign="negative" />
            <GrossProfitRow grossProfit={grossProfit} revenue={revenue} />
            <SpacerRow />

            {/* Marketing OpEx */}
            <SectionHeader label="Operating Expenses — Marketing" />
            {PL_GROUPS["OpEx — Marketing"].map(cat => {
              const amt = categoryTotal(cat);
              if (!amt) return null;
              return <CategoryRow key={cat} category={cat} amount={amt} base={revenue} onClick={() => setDrillCategory(cat)} />;
            })}
            <SubtotalRow label="Marketing Subtotal" amount={marketingOpex} base={revenue} sign="negative" />
            <SpacerRow />

            {/* Personnel */}
            <SectionHeader label="Operating Expenses — Personnel" />
            {PL_GROUPS["OpEx — Personnel"].map(cat => {
              const amt = categoryTotal(cat);
              if (!amt) return null;
              return <CategoryRow key={cat} category={cat} amount={amt} base={revenue} onClick={() => setDrillCategory(cat)} />;
            })}
            <SubtotalRow label="Personnel Subtotal" amount={personnelOpex} base={revenue} sign="negative" />
            <SpacerRow />

            {/* Facilities */}
            <SectionHeader label="Operating Expenses — Facilities & Logistics" />
            {PL_GROUPS["OpEx — Facilities & Logistics"].map(cat => {
              const amt = categoryTotal(cat);
              if (!amt) return null;
              return <CategoryRow key={cat} category={cat} amount={amt} base={revenue} onClick={() => setDrillCategory(cat)} />;
            })}
            <SubtotalRow label="Facilities Subtotal" amount={facilitiesOpex} base={revenue} sign="negative" />
            <SpacerRow />

            {/* G&A */}
            <SectionHeader label="Operating Expenses — General & Admin" />
            {PL_GROUPS["OpEx — G&A"].map(cat => {
              const amt = categoryTotal(cat);
              if (!amt) return null;
              return <CategoryRow key={cat} category={cat} amount={amt} base={revenue} onClick={() => setDrillCategory(cat)} />;
            })}
            <SubtotalRow label="G&A Subtotal" amount={gaOpex} base={revenue} sign="negative" />
            <SpacerRow />

            <SubtotalRow label="Total OpEx" amount={totalOpex} base={revenue} sign="negative" bold />
            <OperatingIncomeRow operatingIncome={operatingIncome} revenue={revenue} />
            <SpacerRow />

            {/* Below the line */}
            <SectionHeader label="Below the Line" />
            {PL_GROUPS["Below the Line"].map(cat => {
              const amt = categoryTotal(cat);
              if (!amt) return null;
              return <CategoryRow key={cat} category={cat} amount={amt} base={revenue} onClick={() => setDrillCategory(cat)} />;
            })}
            <SubtotalRow label="Below-Line Subtotal" amount={belowLine} base={revenue} sign="negative" />
            <SpacerRow />

            {/* Unclassified */}
            {unclassified > 0 && (
              <>
                <SectionHeader label="Unclassified — Pending Breakdown" warning />
                {PL_GROUPS["Unclassified (Pending)"].map(cat => {
                  const amt = categoryTotal(cat);
                  if (!amt) return null;
                  return <CategoryRow key={cat} category={cat} amount={amt} base={revenue} onClick={() => setDrillCategory(cat)} />;
                })}
                <SubtotalRow label="Unclassified Subtotal" amount={unclassified} base={revenue} sign="negative" />
                <SpacerRow />
              </>
            )}

            {/* Net Income */}
            <NetIncomeRow netIncome={netIncome} revenue={revenue} />
          </tbody>
        </table>
      </div>

      {/* Methodology note */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Methodology &amp; Caveats</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <Note title="Cash basis, not accrual" body="COGS appears when you pay the factory, not when you sell the inventory. Marketing shows when the ad platform billed your card, not when the impression served. Real accrual accounting requires invoice-level data, not bank statements alone." />
          <Note title="Revenue definition" body="Deposits to …0115 (Shopify + Ferguson marketplace). Does not yet separate gross sales from processor fees or chargebacks — requires Shopify payout detail." />
          <Note title="COGS includes Factory + Import" body="Shipping & Freight is classified as OpEx (Facilities & Logistics), not COGS, because it's mostly outbound fulfillment. Move it into COGS if you prefer landed-cost reporting." />
          <Note title="~$1M in 115 outflows still unclassified" body="KBBO ACH is now itemized (Google Ads, Zline, Worldwide, Renan Bonin). The remaining $1.05M Q1 'Unclassified Outflows (115)' represents non-KBBO debits — likely outgoing wires or checks — and will resolve once the bank statement PDFs are parsed." />
          <Note title="Owner draws are below-line" body="Tuition payments via PayPal and cash withdrawals are distributions, not operating expenses — they reduce cash but not operating income." />
          <Note title="Transfers excluded" body="Movements between …0115 and …2285 cancel out and are not double-counted." />
        </div>
      </div>
    </div>
  );
}

// ── Row components ──────────────────────────────────────────────────────────

function MarginCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{sub}</div>
    </div>
  );
}

function SpacerRow() {
  return <tr><td colSpan={3} className="h-2" /></tr>;
}

function SectionHeader({ label, warning }: { label: string; warning?: boolean }) {
  return (
    <tr className="bg-gray-800/30 border-t border-gray-800">
      <td className={`py-2 px-4 text-[11px] uppercase tracking-wider font-semibold ${warning ? "text-yellow-400" : "text-gray-500"}`} colSpan={3}>
        {label}
      </td>
    </tr>
  );
}

function RevenueRow({ revenue }: { revenue: number }) {
  return (
    <tr className="bg-emerald-900/10 border-y border-emerald-800/30">
      <td className="py-3 px-4 font-bold text-emerald-400">Revenue</td>
      <td className="py-3 px-4 text-right font-bold text-emerald-400">{fmt(revenue)}</td>
      <td className="py-3 px-4 text-right text-emerald-400 font-semibold">100.0%</td>
    </tr>
  );
}

function CategoryRow({ category, amount, base, onClick }: { category: string; amount: number; base: number; onClick: () => void }) {
  return (
    <tr onClick={onClick} className="hover:bg-gray-800/50 cursor-pointer transition-colors">
      <td className={`py-2 px-4 pl-8 text-xs ${CATEGORY_TEXT[category] ?? "text-gray-400"} hover:underline`}>
        {category} <span className="text-gray-600">→</span>
      </td>
      <td className="py-2 px-4 text-right text-gray-300 text-xs">({fmt(amount)})</td>
      <td className="py-2 px-4 text-right text-gray-500 text-xs">{pct(amount, base)}</td>
    </tr>
  );
}

function SubtotalRow({ label, amount, base, sign, bold }: { label: string; amount: number; base: number; sign: "positive" | "negative"; bold?: boolean }) {
  const cls = bold ? "font-bold text-white" : "font-semibold text-gray-300";
  return (
    <tr className="border-t border-gray-800 bg-gray-800/20">
      <td className={`py-2.5 px-4 pl-4 text-xs uppercase tracking-wide ${cls}`}>{label}</td>
      <td className={`py-2.5 px-4 text-right text-sm ${cls} ${sign === "negative" ? "text-red-400" : "text-emerald-400"}`}>
        {sign === "negative" ? `(${fmt(amount)})` : fmt(amount)}
      </td>
      <td className={`py-2.5 px-4 text-right text-xs ${cls}`}>{pct(amount, base)}</td>
    </tr>
  );
}

function GrossProfitRow({ grossProfit, revenue }: { grossProfit: number; revenue: number }) {
  const color = grossProfit >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <tr className="border-y-2 border-gray-700 bg-gray-800/50">
      <td className="py-3 px-4 font-bold text-white">Gross Profit</td>
      <td className={`py-3 px-4 text-right font-bold ${color}`}>{fmt(grossProfit)}</td>
      <td className={`py-3 px-4 text-right font-bold ${color}`}>{pct(grossProfit, revenue)}</td>
    </tr>
  );
}

function OperatingIncomeRow({ operatingIncome, revenue }: { operatingIncome: number; revenue: number }) {
  const color = operatingIncome >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <tr className="border-y-2 border-gray-700 bg-gray-800/50">
      <td className="py-3 px-4 font-bold text-white">Operating Income</td>
      <td className={`py-3 px-4 text-right font-bold ${color}`}>{fmt(operatingIncome)}</td>
      <td className={`py-3 px-4 text-right font-bold ${color}`}>{pct(operatingIncome, revenue)}</td>
    </tr>
  );
}

function NetIncomeRow({ netIncome, revenue }: { netIncome: number; revenue: number }) {
  const color = netIncome >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <tr className="border-y-4 border-double border-gray-600 bg-gray-800/70">
      <td className="py-4 px-4 font-bold text-white text-base">Net Income</td>
      <td className={`py-4 px-4 text-right font-bold text-base ${color}`}>{fmt(netIncome)}</td>
      <td className={`py-4 px-4 text-right font-bold ${color}`}>{pct(netIncome, revenue)}</td>
    </tr>
  );
}

function Note({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-gray-800/40 border border-gray-800 rounded-lg p-3">
      <div className="text-white text-xs font-medium mb-1">{title}</div>
      <div className="text-gray-400 text-xs leading-relaxed">{body}</div>
    </div>
  );
}
