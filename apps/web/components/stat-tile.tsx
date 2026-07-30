import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  className,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="size-3.5" aria-hidden="true" />}
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
