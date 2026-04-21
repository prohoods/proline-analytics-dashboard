"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";

interface UploadedFile {
  name: string;
  size: number;
  status: "uploading" | "parsed" | "error";
  error?: string;
  id?: string;
  account?: string;
  period?: { start: string; end: string };
  transactionCount?: number;
  uncategorized?: number;
  totalDebits?: number;
  totalCredits?: number;
  persisted?: "blob" | "memory";
}

interface ExpectedStatement {
  key: string;
  label: string;
  description: string;
  priority: "high" | "medium";
}

const EXPECTED_STATEMENTS: ExpectedStatement[] = [
  { key: "keybank-0115-2026-q2",  label: "KeyBank …0115 — Apr 2026 onward",   description: "Operating account, monthly. Upload as each month closes.", priority: "high" },
  { key: "keybank-2285-2026-q2",  label: "KeyBank …2285 — Apr 2026 onward",   description: "Payroll/expense account, monthly. Upload as each month closes.", priority: "high" },
  { key: "keybank-0115-2025",     label: "KeyBank …0115 — all of 2025",        description: "Needed to build YTD + trailing-12-month views.", priority: "high" },
  { key: "keybank-2285-2025",     label: "KeyBank …2285 — all of 2025",        description: "Needed to build YTD + trailing-12-month views.", priority: "high" },
  { key: "chase-cc",              label: "Chase Business Credit — all months", description: "Resolves the $6–8K monthly 'Chase Credit Crdepay' ACH payments.", priority: "high" },
  { key: "keybank-ach-export",    label: "KeyBank ACH / Bill Pay export (CSV)", description: "Unblocks the $1.6M 'KBBO' mystery — shows actual ACH payees.", priority: "high" },
  { key: "keybank-1071",          label: "KeyBank …1071 sub-account",          description: "Receives 'Internet Trf To DDA' transfers — 1 recent statement is enough.", priority: "medium" },
  { key: "keybank-5601",          label: "KeyBank …448615601888 sub-account",  description: "Receives internal transfers — 1 recent statement is enough.", priority: "medium" },
  { key: "keybank-7913",          label: "KeyBank …448603037913 sub-account",  description: "Referenced by internal transfers — 1 recent statement is enough.", priority: "medium" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") || f.name.toLowerCase().endsWith(".csv"));
    if (arr.length === 0) return;

    const initial: UploadedFile[] = arr.map(f => ({ name: f.name, size: f.size, status: "uploading" }));
    setFiles(prev => [...prev, ...initial]);

    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      const form = new FormData();
      form.append("file", f);
      try {
        const res = await fetch("/api/finance/upload", { method: "POST", body: form });
        const data = await res.json();
        setFiles(prev => prev.map(p => p.name === f.name
          ? {
              ...p,
              status: res.ok ? "parsed" : "error",
              error: data.error,
              id: data.id,
              account: data.account,
              period: data.period,
              transactionCount: data.transactionCount,
              uncategorized: data.uncategorized,
              totalDebits: data.totalDebits,
              totalCredits: data.totalCredits,
              persisted: data.persisted,
            }
          : p));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setFiles(prev => prev.map(p => p.name === f.name ? { ...p, status: "error", error: msg } : p));
      }
    }
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center text-xl">
          📤
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Upload Statements</h1>
          <p className="text-gray-500 text-sm mt-0.5">Drop bank statement PDFs (or ACH CSVs) here — the more we have, the sharper the reporting gets</p>
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-emerald-500 bg-emerald-900/10"
            : "border-gray-700 bg-gray-900 hover:border-gray-600 hover:bg-gray-800/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,application/pdf,.csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div className="text-5xl mb-3">{isDragging ? "📥" : "📄"}</div>
        <div className="text-white font-semibold text-lg">
          {isDragging ? "Drop to upload" : "Drop PDF statements here"}
        </div>
        <div className="text-gray-500 text-sm mt-1">
          or <span className="text-emerald-400 underline">click to browse</span> — PDFs and CSVs accepted
        </div>
      </div>

      {/* Upload results */}
      {files.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Recent Uploads</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
                <th className="py-2.5 px-4 text-left">File</th>
                <th className="py-2.5 px-4 text-left">Account / Period</th>
                <th className="py-2.5 px-4 text-right">Txns</th>
                <th className="py-2.5 px-4 text-right">Debits</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-right">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {files.map((f, i) => (
                <tr key={`${f.name}-${i}`}>
                  <td className="py-3 px-4 text-white font-mono text-xs">
                    {f.name}
                    <div className="text-[10px] text-gray-500 mt-0.5">{formatBytes(f.size)}</div>
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-300">
                    {f.account ? <>…{f.account}<div className="text-[10px] text-gray-500 mt-0.5">{f.period?.start} → {f.period?.end}</div></> : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-mono text-white">
                    {f.transactionCount ?? "—"}
                    {typeof f.uncategorized === "number" && f.uncategorized > 0 && (
                      <div className="text-[10px] text-yellow-400 mt-0.5">{f.uncategorized} uncat.</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-mono text-gray-300">
                    {typeof f.totalDebits === "number" ? f.totalDebits.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—"}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {f.status === "uploading" && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                        <span className="w-3 h-3 rounded-full border-2 border-gray-600 border-t-emerald-400 animate-spin" />
                        Parsing
                      </span>
                    )}
                    {f.status === "parsed" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-800/40" title={`persisted: ${f.persisted}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Parsed · {f.persisted === "blob" ? "saved" : "local"}
                      </span>
                    )}
                    {f.status === "error" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-900/40 text-red-400 border border-red-800/40" title={f.error}>
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        {f.error ?? "Error"}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-xs">
                    {f.id && (
                      <Link href={`/finance/upload/${f.id}`} className="text-emerald-400 hover:underline">
                        Open →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 bg-gray-800/30 border-t border-gray-800 text-xs text-gray-500">
            Parsed on upload. Click <span className="text-emerald-400">Open</span> to review transactions and category assignments.
            {files.some(f => f.persisted === "memory") && (
              <> Memory-only storage means data will be lost on redeploy — add <span className="font-mono text-gray-400">BLOB_READ_WRITE_TOKEN</span> to enable durable persistence.</>
            )}
          </div>
        </div>
      )}

      {/* Expected statements checklist */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Statements we&apos;re looking for</h2>
          <p className="text-xs text-gray-500 mt-0.5">Priority-ordered. High priority = unblocks big pieces of the dashboard.</p>
        </div>
        <div className="divide-y divide-gray-800">
          {EXPECTED_STATEMENTS.map(s => (
            <div key={s.key} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-800/30">
              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${s.priority === "high" ? "bg-red-400" : "bg-yellow-400"}`} />
              <div className="flex-1">
                <div className="text-sm text-white font-medium">{s.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.description}</div>
              </div>
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${s.priority === "high" ? "text-red-400" : "text-yellow-400"}`}>
                {s.priority}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly cadence reminder */}
      <div className="bg-emerald-900/10 border border-emerald-800/40 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-emerald-400 mb-2">Monthly cadence</h2>
        <p className="text-sm text-gray-300 leading-relaxed">
          Best pattern: upload the previous month&apos;s KeyBank …0115 and …2285 statements within the first week of each month.
          Once the PDF parser is live, these will flow straight into Financial Overview and Cash &amp; Treasury the moment they&apos;re dropped in.
        </p>
      </div>
    </div>
  );
}
