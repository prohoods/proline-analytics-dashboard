"use client";

import { useState } from "react";
import CallDetailDrawer from "@/components/CallDetailDrawer";

export interface CallRow {
  id: string;
  phone_e164: string;
  call_started_at: string;
  duration_seconds: number | null;
  transcription_status: string | null;
  category: string | null;
  summary: string | null;
  sentiment: string | null;
  follow_up_needed: boolean | null;
  error_message: string | null;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(s: number | null) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function CallsTable({ rows }: { rows: CallRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="text-sm text-white font-medium">Recent calls</div>
          <div className="text-xs text-gray-500">click a row to see transcript · last 30 days</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="text-gray-500 text-xs uppercase tracking-wider">
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2">Time</th>
                <th className="text-left px-4 py-2">From</th>
                <th className="text-right px-4 py-2">Duration</th>
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-left px-4 py-2">Sentiment</th>
                <th className="text-left px-4 py-2">Summary</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500 text-sm">
                    No calls yet. CallRail webhook activity will appear here.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpenId(r.id)}
                  className="border-b border-gray-800/60 hover:bg-gray-800/40 align-top cursor-pointer"
                >
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmtDate(r.call_started_at)}</td>
                  <td className="px-4 py-3 text-gray-300 font-mono text-xs">{r.phone_e164}</td>
                  <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">
                    {fmtDuration(r.duration_seconds)}
                  </td>
                  <td className="px-4 py-3">
                    <CategoryBadge category={r.category} />
                  </td>
                  <td className="px-4 py-3">
                    <SentimentBadge sentiment={r.sentiment} />
                  </td>
                  <td className="px-4 py-3 text-gray-300 max-w-[480px]">
                    {r.summary ? (
                      <div>
                        <div className="leading-snug">{r.summary}</div>
                        {r.follow_up_needed && (
                          <div className="mt-1 text-xs text-rose-400">⚠ Follow-up needed</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-600 text-xs italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.transcription_status} error={r.error_message} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CallDetailDrawer callId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-gray-600 text-xs">—</span>;
  const styles: Record<string, string> = {
    sales: "bg-blue-900/40 text-blue-300 border-blue-700/50",
    support: "bg-amber-900/40 text-amber-300 border-amber-700/50",
    other: "bg-gray-800 text-gray-400 border-gray-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border capitalize ${styles[category] ?? styles.other}`}>
      {category}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return <span className="text-gray-600 text-xs">—</span>;
  const styles: Record<string, string> = {
    positive: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
    neutral: "bg-gray-800 text-gray-400 border-gray-700",
    negative: "bg-rose-900/40 text-rose-300 border-rose-700/50",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border capitalize ${styles[sentiment] ?? styles.neutral}`}>
      {sentiment}
    </span>
  );
}

function StatusBadge({ status, error }: { status: string | null; error: string | null }) {
  if (!status) return <span className="text-gray-600 text-xs">—</span>;
  const styles: Record<string, string> = {
    classified: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
    transcribed: "bg-blue-900/40 text-blue-300 border-blue-700/50",
    transcribing: "bg-gray-800 text-gray-400 border-gray-700",
    pending: "bg-gray-800 text-gray-500 border-gray-700",
    no_recording: "bg-gray-800 text-gray-500 border-gray-700",
    error: "bg-red-900/40 text-red-300 border-red-700/50",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${styles[status] ?? styles.pending}`}
      title={error ?? ""}
    >
      {status}
    </span>
  );
}
