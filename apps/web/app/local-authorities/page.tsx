import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Hourglass } from "lucide-react";
import { getLocalAuthoritySummaries } from "@/lib/data/local-authorities";
import { formatDays, formatNumber, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Local authorities",
  description: "Food hygiene rating statistics by UK local authority.",
};

export default async function LocalAuthoritiesPage() {
  const authorities = await getLocalAuthoritySummaries();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Local authorities</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Establishment counts and rating statistics per participating local authority, computed
          nightly from the latest ingestion.
        </p>
      </div>

      {authorities.length === 0 ? (
        <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No local authority metrics have been computed yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {authorities.map((la) => (
            <div key={la.code} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{la.name}</h2>
                  {la.regionName && (
                    <p className="text-xs text-muted-foreground">{la.regionName}</p>
                  )}
                </div>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                  {la.schemeType}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="size-3" aria-hidden="true" /> Establishments
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {formatNumber(la.totalEstablishments)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Rated 0–2</dt>
                  <dd className="font-medium tabular-nums">
                    {formatPercent(la.proportionRated0to2)} ({formatNumber(la.rated0to2Count)})
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Rated 5</dt>
                  <dd className="font-medium tabular-nums">{formatNumber(la.rated5Count)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Hourglass className="size-3" aria-hidden="true" /> New rating pending
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {formatNumber(la.newRatingPendingCount)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Avg. time since inspection</dt>
                  <dd className="font-medium tabular-nums">
                    {formatDays(la.avgDaysSinceInspection)}
                  </dd>
                </div>
              </dl>

              {la.ratingDistribution.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    Full rating breakdown
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {la.ratingDistribution.map((r) => (
                      <li key={r.key} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="tabular-nums">{formatNumber(r.count)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {la.businessTypeMix.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    Business type mix
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {la.businessTypeMix.slice(0, 8).map((bt) => (
                      <li key={bt.label} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{bt.label}</span>
                        <span className="tabular-nums">{formatNumber(bt.count)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <Link
                href={`/establishments?localAuthority=${la.code}`}
                className="mt-4 block rounded-md border px-3 py-2 text-center text-sm font-medium hover:bg-accent"
              >
                View establishments
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
