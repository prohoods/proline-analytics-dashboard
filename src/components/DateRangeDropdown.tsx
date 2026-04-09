"use client";

import { useState } from "react";
import { RangeKey, RANGE_OPTIONS } from "@/lib/date-ranges";

interface Props {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
}

export default function DateRangeDropdown({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const label = RANGE_OPTIONS.find(o => o.key === value)?.label ?? value;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg px-4 py-2 text-sm text-white transition-colors"
      >
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {label}
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => { onChange(opt.key); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                value === opt.key
                  ? "bg-blue-600/20 text-blue-400 font-medium"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
