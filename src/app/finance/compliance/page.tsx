"use client";

import { useState } from "react";
import { useFinancialData } from "@/lib/use-financial-data";
import type { MonthData } from "@/lib/financial-data";
import CategoryDrillDown from "@/components/CategoryDrillDown";
import InfoTooltip from "@/components/InfoTooltip";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// Known filings from Q1 2026 statement review — extend as uploads land
interface Filing {
  name: string;
  authority: string;
  frequency: "Monthly" | "Quarterly" | "Annual" | "Event-driven";
  lastFiledAmount?: number;
  lastFiledDate?: string;
  nextDue: string;
  status: "filed" | "upcoming" | "overdue" | "unknown";
  notes?: string;
}

const FILINGS: Filing[] = [
  { name: "Multi-state Sales Tax (via Avalara)", authority: "50 states", frequency: "Monthly", lastFiledAmount: 42903.42, lastFiledDate: "2026-03-18", nextDue: "2026-04-20", status: "upcoming", notes: "Avalara files automatically; remittance debits …0115" },
  { name: "Avalara Sales Tax Backfiling",         authority: "Multi-state",    frequency: "Event-driven", lastFiledAmount: 108582.84, lastFiledDate: "2026-01-14", nextDue: "—", status: "filed", notes: "One-time catch-up filing completed in January" },
  { name: "Federal Form 1120 (C-Corp income tax)", authority: "IRS", frequency: "Annual", nextDue: "2026-04-15", status: "unknown", notes: "Status pending accountant confirmation — needs 2025 filing verified" },
  { name: "Utah State Income Tax (TC-20)", authority: "Utah State Tax Commission", frequency: "Annual", nextDue: "2026-04-15", status: "unknown", notes: "Needs accountant confirmation" },
  { name: "Form 941 (Quarterly Payroll)", authority: "IRS", frequency: "Quarterly", nextDue: "2026-04-30", status: "upcoming", notes: "Handled by CBIZ payroll — confirm filing with Mark" },
  { name: "Utah Unemployment Insurance", authority: "Utah Workforce Services", frequency: "Quarterly", nextDue: "2026-04-30", status: "upcoming", notes: "Handled by CBIZ" },
  { name: "Form 1099-NEC (Contractor Payments)", authority: "IRS", frequency: "Annual", nextDue: "2027-01-31", status: "upcoming", notes: "Q1 confirmed contractor: Renan Bonin $10,400 (web dev). Watch for additional contractor payments in non-KBBO outflows." },
];

export default function CompliancePage() {
  const { statements, sumCategory, q1 } = useFinancialData();
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const totalAvalara = sumCategory("Taxes & Compliance");
  const avalaraByMonth = statements.map(m => ({
    month: `${m.shortMonth} ${m.year}`,
    amount: sumCategory("Taxes & Compliance", m),
  }));

  const daysUntil = (dateStr: string) => {
    if (dateStr === "—") return null;
    const due = new Date(dateStr).getTime();
    const now = Date.now();
    return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="p-6 space-y-6">
      <CategoryDrillDown category={drillCategory} onClose={() => setDrillCategory(null)} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center text-xl">⚖️</div>
        <div>
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-white">Regulatory &amp; Compliance</h1>
            <InfoTooltip title="Regulatory &amp; Compliance">
              <p className="mb-2">This page tracks every tax filing and government obligation the company has — what we owe, what&apos;s been filed, and what&apos;s coming due.</p>
              <p className="mb-2"><strong>Sales tax</strong> is collected from customers in all 50 states and remitted monthly through Avalara. <strong>Federal &amp; state income tax</strong> (Form 1120, Utah TC-20) are annual. <strong>Payroll taxes</strong> (Form 941, Utah unemployment) are quarterly.</p>
              <p>Why it matters: missed filings trigger penalties and interest. This is the page a CFO uses to make sure nothing slips.</p>
            </InfoTooltip>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">Tax filings, sales tax obligations, and compliance calendar</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Q1 Tax & Compliance Spend" value={fmt(totalAvalara)} sub={`${((totalAvalara / q1.totalRevenue) * 100).toFixed(1)}% of revenue`} color="text-yellow-400" />
        <KpiCard label="Avg Monthly Sales Tax" value={fmt(totalAvalara / statements.length)} sub="Includes Jan backfiling spike" color="text-yellow-400" />
        <KpiCard label="Filings on Schedule" value={`${FILINGS.filter(f => f.status === "filed" || f.status === "upcoming").length}/${FILINGS.length}`} sub="Known filings tracked" color="text-emerald-400" />
        <KpiCard label="Overdue / Unknown" value={`${FILINGS.filter(f => f.status === "overdue" || f.status === "unknown").length}`} sub="Need confirmation" color={FILINGS.some(f => f.status === "overdue") ? "text-red-400" : "text-yellow-400"} />
      </div>

      {/* Sales tax history — clickable */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Sales Tax Remittance History (Avalara)</h2>
            <p className="text-xs text-gray-500 mt-0.5">Month-by-month sales tax paid through Avalara</p>
          </div>
          <button
            onClick={() => setDrillCategory("Taxes & Compliance")}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
          >
            View transactions →
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2.5 px-4 text-left">Month</th>
              <th className="py-2.5 px-4 text-right">Amount Remitted</th>
              <th className="py-2.5 px-4 text-right">% of Revenue</th>
              <th className="py-2.5 px-4 text-left">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {statements.map(m => {
              const amt = sumCategory("Taxes & Compliance", m);
              const revPct = (amt / monthRev(m)) * 100;
              const isJan = m.shortMonth === "Jan";
              return (
                <tr key={m.month} className="hover:bg-gray-800/30">
                  <td className="py-3 px-4 font-medium text-white">{m.shortMonth} {m.year}</td>
                  <td className="py-3 px-4 text-right text-yellow-400 font-semibold">{fmt(amt)}</td>
                  <td className="py-3 px-4 text-right text-gray-400 text-xs">{revPct.toFixed(1)}%</td>
                  <td className="py-3 px-4 text-xs text-gray-500">
                    {isJan ? "Includes $108,583 one-time backfiling" : "Standard monthly remittance"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-700 bg-gray-800/50 font-bold text-white">
              <td className="py-3 px-4">Q1 Total</td>
              <td className="py-3 px-4 text-right text-yellow-400">{fmt(totalAvalara)}</td>
              <td className="py-3 px-4 text-right">—</td>
              <td className="py-3 px-4" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Filing calendar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Filing Calendar</h2>
          <p className="text-xs text-gray-500 mt-0.5">All known federal, state, and local filings. Statuses pending accountant confirmation.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
              <th className="py-2.5 px-4 text-left">Filing</th>
              <th className="py-2.5 px-4 text-left">Authority</th>
              <th className="py-2.5 px-4 text-left">Frequency</th>
              <th className="py-2.5 px-4 text-left">Last Filed</th>
              <th className="py-2.5 px-4 text-left">Next Due</th>
              <th className="py-2.5 px-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {FILINGS.map(f => {
              const days = daysUntil(f.nextDue);
              return (
                <tr key={f.name} className="hover:bg-gray-800/30">
                  <td className="py-3 px-4">
                    <div className="text-white font-medium">{f.name}</div>
                    {f.notes && <div className="text-xs text-gray-500 mt-0.5">{f.notes}</div>}
                  </td>
                  <td className="py-3 px-4 text-gray-300 text-xs">{f.authority}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{f.frequency}</td>
                  <td className="py-3 px-4 text-xs">
                    {f.lastFiledDate ? (
                      <div>
                        <div className="text-gray-300">{f.lastFiledDate}</div>
                        {f.lastFiledAmount && <div className="text-gray-500">{fmt(f.lastFiledAmount)}</div>}
                      </div>
                    ) : <span className="text-gray-600 italic">Unknown</span>}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <div className="text-gray-300">{f.nextDue}</div>
                    {days !== null && f.status !== "filed" && (
                      <div className={days < 0 ? "text-red-400" : days < 14 ? "text-yellow-400" : "text-gray-500"}>
                        {days < 0 ? `${Math.abs(days)} days overdue` : `${days} days away`}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <StatusBadge status={f.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 1099 tracking */}
      <div className="bg-emerald-900/10 border border-emerald-800/40 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-emerald-400 mb-2">1099-NEC Preparation — Q1 Known Contractors</h2>
        <p className="text-sm text-gray-300 leading-relaxed">
          KBBO ACH is now itemized. Q1 contractor payments identified: <span className="text-white font-semibold">Renan Bonin $10,400</span> (website dev). Keep watching non-KBBO 115 outflows — once the bank statement PDFs are parsed, any remaining contractor payments will be auto-surfaced against the $600+ threshold.
        </p>
      </div>

      {/* State nexus placeholder */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Coming to this page</h2>
        <ul className="text-sm text-gray-400 space-y-1.5 list-disc list-inside">
          <li>State nexus map with economic + physical presence thresholds per state</li>
          <li>1099 candidate list auto-built from vendor payment data</li>
          <li>Reconciliation: Avalara remittances vs Shopify sales tax collected</li>
          <li>Document vault for filed returns and state correspondence</li>
        </ul>
      </div>
    </div>
  );
}

function monthRev(m: MonthData): number {
  return m.acct115Deposits;
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{sub}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: Filing["status"] }) {
  const styles = {
    filed:    { bg: "bg-emerald-900/40", text: "text-emerald-400", border: "border-emerald-800/40", dot: "bg-emerald-400", label: "Filed" },
    upcoming: { bg: "bg-blue-900/40",    text: "text-blue-400",    border: "border-blue-800/40",    dot: "bg-blue-400",    label: "Upcoming" },
    overdue:  { bg: "bg-red-900/40",     text: "text-red-400",     border: "border-red-800/40",     dot: "bg-red-400",     label: "Overdue" },
    unknown:  { bg: "bg-yellow-900/40",  text: "text-yellow-400",  border: "border-yellow-800/40",  dot: "bg-yellow-400",  label: "Unknown" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${styles.bg} ${styles.text} border ${styles.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
      {styles.label}
    </span>
  );
}
