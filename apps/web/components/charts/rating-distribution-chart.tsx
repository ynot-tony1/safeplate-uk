"use client";

import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { ResponsiveContainer } from "recharts";
import type { RatingDatum } from "@/lib/data/dashboard";
import { ratingSeverity } from "@/lib/rating-labels";
import { ChartShell, CHART_AXIS_TICK, CHART_TOOLTIP_STYLE } from "./chart-shell";

const SEVERITY_COLOR: Record<string, string> = {
  good: "var(--chart-good)",
  warning: "var(--chart-warning)",
  serious: "var(--chart-serious)",
  critical: "var(--chart-critical)",
  neutral: "var(--chart-ink-muted)",
};

const SEVERITY_LABEL: Record<string, string> = {
  good: "Good",
  warning: "Satisfactory",
  serious: "Needs improvement",
  critical: "Urgent action needed",
  neutral: "Not yet rated",
};

/**
 * Rating is an evaluative/severity scale, not an arbitrary category set, so
 * each bar takes a fixed status color (good/warning/serious/critical) rather
 * than a cycled categorical hue. The legend below repeats color + text so
 * severity is never conveyed by color alone.
 */
export function RatingDistributionChart({ data }: { data: RatingDatum[] }) {
  const usedSeverities = Array.from(new Set(data.map((d) => ratingSeverity(d.key))));

  return (
    <ChartShell
      title="Rating distribution"
      description="Current ratingKey across all indexed establishments"
      empty={data.length === 0}
    >
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
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
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: "var(--chart-gridline)" }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Establishments" maxBarSize={48}>
              {data.map((entry) => (
                <Cell key={entry.key} fill={SEVERITY_COLOR[ratingSeverity(entry.key)]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.length > 0 && (
        <ul
          className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
          aria-label="Legend"
        >
          {usedSeverities.map((severity) => (
            <li key={severity} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: SEVERITY_COLOR[severity] }}
                aria-hidden="true"
              />
              {SEVERITY_LABEL[severity]}
            </li>
          ))}
        </ul>
      )}
    </ChartShell>
  );
}
