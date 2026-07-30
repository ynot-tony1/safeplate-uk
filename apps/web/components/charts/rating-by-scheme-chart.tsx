"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RatingByScheme } from "@/lib/data/dashboard";
import { ChartShell, CHART_AXIS_TICK, CHART_TOOLTIP_STYLE } from "./chart-shell";

const SCHEME_COLOR: Record<string, string> = {
  FHRS: "var(--chart-cat-1)",
  FHIS: "var(--chart-cat-2)",
};

/** Two series (FHRS, FHIS) → the first two fixed categorical slots, with a legend. */
export function RatingBySchemeChart({ data }: { data: RatingByScheme[] }) {
  const byLabel = new Map<string, { label: string; FHRS: number; FHIS: number }>();
  for (const row of data) {
    const existing = byLabel.get(row.label) ?? { label: row.label, FHRS: 0, FHIS: 0 };
    existing[row.scheme as "FHRS" | "FHIS"] = row.count;
    byLabel.set(row.label, existing);
  }
  const chartData = Array.from(byLabel.values());
  const schemesPresent = Array.from(new Set(data.map((d) => d.scheme)));

  return (
    <ChartShell
      title="Rating distribution by scheme"
      description="FHRS (England/Wales/N. Ireland) vs FHIS (Scotland)"
      empty={chartData.length === 0}
    >
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-gridline)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={CHART_AXIS_TICK}
              stroke="var(--chart-baseline)"
              interval={0}
              angle={-20}
              textAnchor="end"
              height={70}
            />
            <YAxis tick={CHART_AXIS_TICK} stroke="var(--chart-baseline)" allowDecimals={false} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "var(--chart-gridline)" }} />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--chart-ink-secondary)" }} />
            {schemesPresent.includes("FHRS") && (
              <Bar dataKey="FHRS" fill={SCHEME_COLOR.FHRS} radius={[4, 4, 0, 0]} maxBarSize={28} />
            )}
            {schemesPresent.includes("FHIS") && (
              <Bar dataKey="FHIS" fill={SCHEME_COLOR.FHIS} radius={[4, 4, 0, 0]} maxBarSize={28} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}
