import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE_VAR: Record<string, string> = {
  blue: "--chart-cat-1",
  green: "--chart-cat-2",
  magenta: "--chart-cat-3",
  amber: "--chart-cat-4",
  aqua: "--chart-cat-5",
  orange: "--chart-cat-6",
  good: "--chart-good",
  critical: "--chart-critical",
};

export type StatTileTone = keyof typeof TONE_VAR;

export function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  tone,
  className,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  hint?: string;
  tone?: StatTileTone;
  className?: string;
}) {
  const colorVar = tone ? TONE_VAR[tone] : undefined;

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {Icon && (
          <span
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md"
            style={
              colorVar
                ? {
                    color: `var(${colorVar})`,
                    backgroundColor: `color-mix(in oklch, var(${colorVar}) 14%, transparent)`,
                  }
                : undefined
            }
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
        )}
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
