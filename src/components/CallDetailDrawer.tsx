"use client";

import { useEffect, useState } from "react";

interface CallDetail {
  id: string;
  phone_e164: string;
  call_started_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  transcription_status: string | null;
  category: string | null;
  summary: string | null;
  sentiment: string | null;
  key_points: string[] | null;
  follow_up_needed: boolean | null;
  error_message: string | null;
}

function fmtDuration(s: number | null) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function CallDetailDrawer({
  callId,
  onClose,
}: {
  callId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<CallDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!callId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/ai-reporting/calls/${callId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setData(j.call);
        else setError(j.error ?? "failed to load");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [callId]);

  if (!callId) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="ml-auto relative w-full max-w-2xl h-full bg-gray-950 border-l border-gray-800 overflow-y-auto">
        <div className="sticky top-0 z-10 px-6 py-4 border-b border-gray-800 bg-gray-950 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Call detail</div>
            <div className="text-sm font-mono text-gray-300 mt-0.5">{callId}</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {loading && (
            <div className="text-gray-500 text-sm">Loading…</div>
          )}
          {error && (
            <div className="p-3 rounded-lg border border-red-700 bg-red-900/20 text-red-200 text-sm">
              {error}
            </div>
          )}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="From" value={data.phone_e164} mono />
                <Field label="When" value={new Date(data.call_started_at).toLocaleString()} />
                <Field label="Duration" value={fmtDuration(data.duration_seconds)} />
                <Field label="Category" value={data.category ?? "—"} />
                <Field label="Sentiment" value={data.sentiment ?? "—"} />
                <Field label="Status" value={data.transcription_status ?? "—"} />
              </div>

              {data.recording_url && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Recording</div>
                  <audio controls src={data.recording_url} className="w-full" />
                </div>
              )}

              {data.summary && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-1.5">Summary</div>
                  <div className="text-sm text-gray-200 leading-relaxed">{data.summary}</div>
                  {data.follow_up_needed && (
                    <div className="mt-2 text-xs text-rose-400">⚠ Follow-up needed</div>
                  )}
                </div>
              )}

              {data.key_points && data.key_points.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-1.5">Key points</div>
                  <ul className="text-sm text-gray-200 space-y-1 list-disc pl-5">
                    {data.key_points.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {data.transcript && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-1.5">Transcript</div>
                  <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap bg-gray-900 border border-gray-800 rounded-lg p-3 max-h-96 overflow-y-auto">
                    {data.transcript}
                  </div>
                </div>
              )}

              {data.error_message && (
                <div className="p-3 rounded-lg border border-red-700 bg-red-900/20 text-red-200 text-xs">
                  <div className="font-semibold mb-1">Pipeline error</div>
                  <div>{data.error_message}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-sm text-gray-200 mt-0.5 capitalize ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
