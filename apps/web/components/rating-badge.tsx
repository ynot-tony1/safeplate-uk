import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import { ratingLabel, ratingSeverity } from "@/lib/rating-labels";

const SEVERITY_STYLES: Record<string, string> = {
  good: "bg-[color-mix(in_oklch,var(--chart-good)_16%,transparent)] text-[var(--chart-good)] border-[var(--chart-good)]/30",
  warning:
    "bg-[color-mix(in_oklch,var(--chart-warning)_20%,transparent)] text-[color:oklch(0.35_0.15_70)] dark:text-[var(--chart-warning)] border-[var(--chart-warning)]/40",
  serious:
    "bg-[color-mix(in_oklch,var(--chart-serious)_18%,transparent)] text-[color:oklch(0.4_0.15_40)] dark:text-[var(--chart-serious)] border-[var(--chart-serious)]/40",
  critical:
    "bg-[color-mix(in_oklch,var(--chart-critical)_16%,transparent)] text-[var(--chart-critical)] border-[var(--chart-critical)]/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

const SEVERITY_ICON: Record<string, typeof CheckCircle2> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  serious: ShieldAlert,
  critical: ShieldX,
  neutral: HelpCircle,
};

/**
 * Ratings never rely on color alone: every badge pairs a status color with
 * an icon AND the text label, per WCAG "use of color" guidance.
 */
export function RatingBadge({
  ratingKey,
  className,
}: {
  ratingKey: string | null | undefined;
  className?: string;
}) {
  const severity = ratingSeverity(ratingKey);
  const Icon = SEVERITY_ICON[severity] ?? HelpCircle;
  const label = ratingLabel(ratingKey);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium",
        SEVERITY_STYLES[severity],
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
