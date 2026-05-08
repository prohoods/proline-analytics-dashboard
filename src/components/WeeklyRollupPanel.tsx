"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface WeeklyRollupData {
  week_start: string;
  generated_at: string;
  total_calls: number;
  sales_count: number;
  support_count: number;
  key_trends: string[] | null;
  content_ideas: string[] | null;
  sales_summary: string | null;
  support_summary: string | null;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekLabel(iso: string): string {
  const start = new Date(`${iso}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
}

export default function WeeklyRollupPanel({
  rollup,
  weekStart,
  thisWeekStart,
  availableWeeks,
  filterParam,
}: {
  rollup: WeeklyRollupData | null;
  weekStart: string;
  thisWeekStart: string;
  availableWeeks: string[];
  filterParam: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const prevWeek = addDaysIso(weekStart, -7);
  const nextWeek = addDaysIso(weekStart, 7);
  const isCurrent = weekStart === thisWeekStart;
  const canGoNext = weekStart < thisWeekStart;

  function buildHref(week: string): string {
    const params = new URLSearchParams();
    if (filterParam) params.set("filter", filterParam);
    params.set("week", week);
    return `/ai-reporting?${params.toString()}`;
  }

  async function regenerate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/ai-reporting/weekly-rollup?week=${encodeURIComponent(weekStart)}`,
        { method: "POST" }
      );
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">
            {isCurrent ? "This week's rollup" : "Weekly rollup"}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {weekLabel(weekStart)}
            {rollup
              ? ` · ${rollup.total_calls} calls · generated ${new Date(rollup.generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              : " · no rollup yet"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={buildHref(prevWeek)}
            className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-800 bg-gray-950 text-gray-400 hover:text-white hover:border-gray-700"
            aria-label="Previous week"
          >
            ←
          </Link>
          {!isCurrent && (
            <Link
              href={buildHref(thisWeekStart)}
              className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-800 bg-gray-950 text-gray-400 hover:text-white hover:border-gray-700"
            >
              This week
            </Link>
          )}
          <Link
            href={buildHref(nextWeek)}
            aria-disabled={!canGoNext}
            tabIndex={canGoNext ? undefined : -1}
            className={`px-2.5 py-1.5 rounded-lg text-xs border ${
              canGoNext
                ? "border-gray-800 bg-gray-950 text-gray-400 hover:text-white hover:border-gray-700"
                : "border-gray-900 bg-gray-950 text-gray-700 pointer-events-none"
            }`}
            aria-label="Next week"
          >
            →
          </Link>
          <button
            onClick={regenerate}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-violet-700/60 bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Generating…" : rollup ? "Regenerate" : "Generate"}
          </button>
        </div>
      </div>

      {availableWeeks.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1">history</span>
          {availableWeeks.slice(0, 12).map((w) => {
            const active = w === weekStart;
            return (
              <Link
                key={w}
                href={buildHref(w)}
                className={`px-2 py-0.5 rounded text-[11px] border ${
                  active
                    ? "bg-violet-600/20 border-violet-700/60 text-violet-300"
                    : "bg-gray-950 border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700"
                }`}
              >
                {weekLabel(w)}
              </Link>
            );
          })}
        </div>
      )}

      {err && (
        <div className="mb-4 p-3 rounded-lg border border-red-700 bg-red-900/20 text-red-200 text-xs">
          {err}
        </div>
      )}

      {!rollup && !busy && (
        <div className="text-sm text-gray-500">
          Click <span className="text-violet-300">Generate</span> to create a rollup of trends, content ideas, and category summaries for this week.
        </div>
      )}

      {rollup && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Key trends" tone="violet" items={rollup.key_trends} />
          <Section title="Content ideas" tone="emerald" items={rollup.content_ideas} />
          <Para title={`Sales (${rollup.sales_count})`} tone="blue" body={rollup.sales_summary} />
          <Para title={`Support (${rollup.support_count})`} tone="amber" body={rollup.support_summary} />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[] | null;
  tone: "violet" | "emerald";
}) {
  const toneClass = tone === "violet" ? "text-violet-300" : "text-emerald-300";
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
      <div className={`text-xs uppercase tracking-wider font-semibold mb-2 ${toneClass}`}>{title}</div>
      {items && items.length > 0 ? (
        <ul className="text-sm text-gray-300 space-y-1.5 list-disc pl-5">
          {items.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-gray-600 italic">—</div>
      )}
    </div>
  );
}

function Para({
  title,
  body,
  tone,
}: {
  title: string;
  body: string | null;
  tone: "blue" | "amber";
}) {
  const toneClass = tone === "blue" ? "text-blue-300" : "text-amber-300";
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
      <div className={`text-xs uppercase tracking-wider font-semibold mb-2 ${toneClass}`}>{title}</div>
      {body ? (
        <p className="text-sm text-gray-300 leading-relaxed">{body}</p>
      ) : (
        <div className="text-xs text-gray-600 italic">—</div>
      )}
    </div>
  );
}
