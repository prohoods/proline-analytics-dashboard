// Reusable skeleton loading components

export function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-800 rounded ${className}`} />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse">
      <div className="h-3 bg-gray-800 rounded w-24 mb-3" />
      <div className="h-8 bg-gray-700 rounded w-32 mb-2" />
      <div className="h-3 bg-gray-800 rounded w-20" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 8 }: { cols?: number }) {
  const widths = ["w-28", "w-20", "w-16", "w-24", "w-16", "w-20", "w-16", "w-20"];
  return (
    <tr className="border-b border-gray-800">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3 px-3">
          <div className={`h-3 bg-gray-800 rounded animate-pulse mx-auto ${widths[i % widths.length]}`} />
        </td>
      ))}
    </tr>
  );
}

export function TableSkeleton({ rows = 8, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div className="h-4 bg-gray-800 rounded w-40 animate-pulse" />
        <div className="h-3 bg-gray-800 rounded w-20 animate-pulse" />
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-800/50 border-b border-gray-800">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="py-3 px-3">
                <div className="h-3 bg-gray-700 rounded w-16 animate-pulse mx-auto" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} cols={cols} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KPISkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
