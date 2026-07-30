"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartShell, CHART_AXIS_TICK, CHART_TOOLTIP_STYLE } from "./chart-shell";

export interface LabeledDatum {
  label: string;
  value: number;
}

export type ValueFormat = "count" | "percent" | "days";

// Server Components can't pass functions as props to Client Components (RSC
// serialization boundary), so callers pass a serializable format name and
// the actual formatter function is resolved here, client-side.
const FORMATTERS: Record<ValueFormat, (value: number) => string> = {
  count: (v) => String(v),
  percent: (v) => `${(v * 100).toFixed(1)}%`,
  days: (v) => `${v.toFixed(0)} days`,
};

/**
 * Generic single-series horizontal bar chart. One series always takes the
 * first categorical slot (blue) — color here is decorative for a single
 * series, so no legend is needed (the chart title names the series).
 */
export function LabeledBarChart({
  title,
  description,
  data,
  valueFormat = "count",
  color = "var(--chart-cat-1)",
}: {
  title: string;
  description?: string;
  data: LabeledDatum[];
  valueFormat?: ValueFormat;
  color?: string;
}) {
  const format = FORMATTERS[valueFormat];
  const height = Math.max(180, data.length * 34 + 40);

  return (
    <ChartShell title={title} description={description} empty={data.length === 0}>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-gridline)" horizontal={false} />
            <XAxis type="number" tick={CHART_AXIS_TICK} stroke="var(--chart-baseline)" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={160}
              tick={CHART_AXIS_TICK}
              stroke="var(--chart-baseline)"
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: "var(--chart-gridline)" }}
              formatter={(value) => format(Number(value))}
            />
            <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} name={title} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}
