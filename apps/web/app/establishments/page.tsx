import type { Metadata } from "next";
import Link from "next/link";
import { establishmentSearchParamsSchema } from "@safeplate/shared";
import { EstablishmentSearchForm } from "@/components/establishment-search-form";
import { EstablishmentList } from "@/components/establishment-list";
import {
  listBusinessTypes,
  listLocalAuthoritiesForFilter,
  searchEstablishments,
} from "@/lib/data/establishments";
import { flattenSearchParams } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search establishments",
  description: "Search and filter UK food hygiene rated establishments.",
};

export default async function EstablishmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = flattenSearchParams(await searchParams);
  const parsed = establishmentSearchParamsSchema.safeParse(rawParams);
  const params = parsed.success ? parsed.data : establishmentSearchParamsSchema.parse({});

  const [businessTypes, localAuthorities, result] = await Promise.all([
    listBusinessTypes(),
    listLocalAuthoritiesForFilter(),
    searchEstablishments(params),
  ]);

  const nextHref = (() => {
    if (!result.nextCursor) return null;
    const qs = new URLSearchParams(rawParams);
    qs.set("cursor", result.nextCursor);
    return `/establishments?${qs.toString()}`;
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Search establishments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search the current FHRS/FHIS snapshot by name, postcode, local authority, business type,
          rating, or distance.
        </p>
      </div>

      {!parsed.success && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Some filters in the URL were invalid and have been ignored.
        </p>
      )}

      <EstablishmentSearchForm
        businessTypes={businessTypes}
        localAuthorities={localAuthorities}
        defaults={rawParams}
      />

      <div aria-live="polite">
        {result.mode === "distance" && (
          <p className="mb-3 text-sm text-muted-foreground">
            Showing results within {params.radiusKm ?? 5} km, nearest first.
          </p>
        )}
        <EstablishmentList items={result.items} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Use your browser&apos;s back button to return to the previous page of results.
        </p>
        {nextHref && (
          <Link
            href={nextHref}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Next page
          </Link>
        )}
      </div>
    </div>
  );
}
