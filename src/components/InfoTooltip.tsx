"use client";

import { useState, useRef, useEffect } from "react";

interface InfoTooltipProps {
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md";
}

// Accessible hover/click tooltip with a question-mark trigger.
// Placed inline next to any term that needs a plain-language explainer.
export default function InfoTooltip({ title, children, size = "sm" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const dot = size === "sm" ? "w-3.5 h-3.5 text-[10px]" : "w-4 h-4 text-[11px]";

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={`ml-1.5 ${dot} rounded-full border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 flex items-center justify-center font-semibold cursor-help leading-none transition-colors`}
        aria-label="More info"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-72 bg-gray-950 border border-gray-700 rounded-lg p-3 shadow-2xl text-left"
        >
          {title && <div className="text-xs font-semibold text-white mb-1">{title}</div>}
          <div className="text-xs text-gray-300 leading-relaxed">{children}</div>
        </span>
      )}
    </span>
  );
}
