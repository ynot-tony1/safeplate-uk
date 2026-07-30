import Link from "next/link";
import { MapPin } from "lucide-react";
import { RatingBadge } from "@/components/rating-badge";
import type { EstablishmentWithDistance } from "@/lib/data/establishments";
import { formatDate } from "@/lib/format";

function addressLine(e: EstablishmentWithDistance): string {
  return [e.addressLine1, e.addressLine2, e.addressLine3, e.addressLine4, e.postcode]
    .filter(Boolean)
    .join(", ");
}

export function EstablishmentList({ items }: { items: EstablishmentWithDistance[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        No establishments match these filters.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border bg-card" aria-label="Search results">
      {items.map((e) => (
        <li
          key={e.fhrsId}
          className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0">
            <Link href={`/establishments/${e.fhrsId}`} className="font-medium hover:underline">
              {e.businessName}
            </Link>
            <p className="mt-0.5 flex items-start gap-1 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{addressLine(e) || "Address not available"}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {e.businessTypeName ?? "Business type not recorded"} · {e.localAuthorityName}
              {e.distanceKm != null && <> · {e.distanceKm.toFixed(1)} km away</>}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            <RatingBadge ratingKey={e.ratingKey} />
            {e.ratingDate && (
              <span className="text-xs text-muted-foreground">
                Rated {formatDate(e.ratingDate)}
              </span>
            )}
            {e.newRatingPending && (
              <span className="text-xs font-medium text-[var(--chart-warning)]">
                New rating pending
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
