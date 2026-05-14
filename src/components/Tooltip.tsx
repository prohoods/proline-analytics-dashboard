// Pure-CSS hover tooltip. Renders a small "?" icon next to the label;
// hovering the wrapping element reveals the text. No JS / no client
// component needed — works inside React Server Components.

interface Props {
  text: string;
  align?: "left" | "right";
}

export default function Tooltip({ text, align = "left" }: Props) {
  return (
    <span className="relative inline-flex group">
      <span
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-700 text-gray-300 text-[10px] font-semibold cursor-help select-none"
        aria-label={text}
      >
        ?
      </span>
      <span
        className={`pointer-events-none absolute bottom-full mb-1.5 z-50 w-64 rounded-md border border-gray-700 bg-gray-950 px-2.5 py-2 text-xs leading-relaxed text-gray-200 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {text}
      </span>
    </span>
  );
}
