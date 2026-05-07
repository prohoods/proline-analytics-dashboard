"use client";

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

export default function WeeklyRollupPanel({
  rollup,
}: {
  rollup: WeeklyRollupData | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/ai-reporting/weekly-rollup", { method: "POST" });
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
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-white">This week's rollup</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {rollup?.week_start ? (
              <>
                week of {new Date(rollup.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" · "}
                {rollup.total_calls} calls
                {" · generated "}
                {new Date(rollup.generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </>
            ) : (
              "no rollup generated yet"
            )}
          </div>
        </div>
        <button
          onClick={regenerate}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-violet-700/60 bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Generating…" : rollup ? "Regenerate" : "Generate"}
        </button>
      </div>

      {err && (
        <div className="mb-4 p-3 rounded-lg border border-red-700 bg-red-900/20 text-red-200 text-xs">
          {err}
        </div>
      )}

      {!rollup && !busy && (
        <div className="text-sm text-gray-500">
          Click <span className="text-violet-300">Generate</span> to create a weekly rollup of trends, content ideas, and category summaries from this week's calls.
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
