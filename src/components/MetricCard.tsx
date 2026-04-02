interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  highlight?: boolean;
}

export default function MetricCard({
  label,
  value,
  subtext,
  trend,
  trendValue,
  highlight,
}: MetricCardProps) {
  return (
    <div
      className={`rounded-xl p-5 border ${
        highlight
          ? "bg-blue-600/10 border-blue-500/30"
          : "bg-gray-900 border-gray-800"
      }`}
    >
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {(subtext || trendValue) && (
        <div className="mt-1 flex items-center gap-2">
          {trendValue && (
            <span
              className={`text-xs font-medium ${
                trend === "up"
                  ? "text-green-400"
                  : trend === "down"
                  ? "text-red-400"
                  : "text-gray-400"
              }`}
            >
              {trend === "up" ? "↑" : trend === "down" ? "↓" : ""} {trendValue}
            </span>
          )}
          {subtext && <span className="text-xs text-gray-500">{subtext}</span>}
        </div>
      )}
    </div>
  );
}
