export function ChartShell({
  title,
  description,
  children,
  empty,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-4">
        {empty ? (
          <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No data available yet.
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--chart-surface)",
  border: "1px solid var(--chart-gridline)",
  borderRadius: 8,
  color: "var(--chart-ink-primary)",
  fontSize: 13,
};

export const CHART_AXIS_TICK = { fill: "var(--chart-ink-muted)", fontSize: 12 };
