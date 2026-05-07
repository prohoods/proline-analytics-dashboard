"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DailyPoint {
  date: string; // YYYY-MM-DD
  sales: number;
  support: number;
  other: number;
}

export default function CallVolumeChart({ data }: { data: DailyPoint[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-white">Call volume — last 30 days</div>
        <div className="text-xs text-gray-500">stacked by category</div>
      </div>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={formatted} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#374151" }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#374151" }} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111827",
                border: "1px solid #374151",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#e5e7eb" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="sales" stackId="a" fill="#3b82f6" name="Sales" />
            <Bar dataKey="support" stackId="a" fill="#f59e0b" name="Support" />
            <Bar dataKey="other" stackId="a" fill="#4b5563" name="Other" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
