"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyCount } from "@/lib/data/dashboard";
import { ChartShell, CHART_AXIS_TICK, CHART_TOOLTIP_STYLE } from "./chart-shell";

export function InspectionsByMonthChart({ data }: { data: MonthlyCount[] }) {
  return (
    <ChartShell
      title="Inspections by month"
      description="Count of rating dates recorded per calendar month"
      empty={data.length === 0}
    >
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-gridline)" vertical={false} />
            <XAxis dataKey="month" tick={CHART_AXIS_TICK} stroke="var(--chart-baseline)" />
            <YAxis tick={CHART_AXIS_TICK} stroke="var(--chart-baseline)" allowDecimals={false} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ stroke: "var(--chart-gridline)" }} />
            <Line
              type="monotone"
              dataKey="count"
              name="Inspections"
              stroke="var(--chart-cat-1)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--chart-cat-1)" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}
