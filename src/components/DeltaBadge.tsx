// Shows period-over-period delta: green for positive, red for negative.
// Pass inverted=true for metrics where increase is bad (discounts, returns).

interface Props {
  current: number;
  previous: number;
  inverted?: boolean;
  className?: string;
}

export default function DeltaBadge({ current, previous, inverted = false, className = "" }: Props) {
  if (!previous || previous === 0) return null;
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const isPositive = delta > 0;
  const isGood = inverted ? !isPositive : isPositive;
  const abs = Math.abs(delta);

  if (abs < 0.1) {
    return <span className={`text-xs text-gray-500 ${className}`}>≈0%</span>;
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isGood ? "text-emerald-400" : "text-red-400"
      } ${className}`}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={isPositive ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
        />
      </svg>
      {abs >= 1000 ? ">999%" : `${abs.toFixed(1)}%`}
    </span>
  );
}
