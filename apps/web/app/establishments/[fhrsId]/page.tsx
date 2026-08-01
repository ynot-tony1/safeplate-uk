import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, MapPin } from "lucide-react";
import { RatingBadge } from "@/components/rating-badge";
import { SingleMarkerMapDynamic } from "@/components/map/single-marker-map-dynamic";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEstablishmentByFhrsId, getRatingChangeHistory } from "@/lib/data/establishments";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? "&copy; OpenStreetMap contributors";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ fhrsId: string }>;
}): Promise<Metadata> {
  const { fhrsId } = await params;
  const establishment = await getEstablishmentByFhrsId(fhrsId);
  return {
    title: establishment ? establishment.businessName : "Establishment not found",
  };
}

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export default async function EstablishmentDetailPage({
  params,
}: {
  params: Promise<{ fhrsId: string }>;
}) {
  const { fhrsId } = await params;
  const establishment = await getEstablishmentByFhrsId(fhrsId);
  if (!establishment) notFound();

  const ratingChanges = await getRatingChangeHistory(fhrsId);

  const address = [
    establishment.addressLine1,
    establishment.addressLine2,
    establishment.addressLine3,
    establishment.addressLine4,
    establishment.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  const hasCoordinates = establishment.latitude != null && establishment.longitude != null;
  const hasScores =
    establishment.hygieneScore != null ||
    establishment.structuralScore != null ||
    establishment.confidenceManagementScore != null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{establishment.businessName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {establishment.businessTypeName ?? "Business type not recorded"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Rating</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <RatingBadge ratingKey={establishment.ratingKey} />
              <span className="text-sm text-muted-foreground">
                {establishment.schemeType} scheme
                {establishment.ratingDate && <> · rated {formatDate(establishment.ratingDate)}</>}
              </span>
              {establishment.newRatingPending && (
                <span className="rounded-md bg-[var(--chart-warning)]/15 px-2 py-1 text-xs font-medium text-[color:oklch(0.35_0.15_70)] dark:text-[var(--chart-warning)]">
                  New rating pending
                </span>
              )}
            </div>

            {hasScores && (
              <div className="mt-4 border-t pt-2">
                <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                  Scores (lower is better)
                </h3>
                <ScoreRow label="Hygiene" value={establishment.hygieneScore} />
                <ScoreRow label="Structural" value={establishment.structuralScore} />
                <ScoreRow
                  label="Confidence in management"
                  value={establishment.confidenceManagementScore}
                />
              </div>
            )}
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Address</h2>
            <p className="mt-2 flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {address || "Address not available"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Local authority:{" "}
              <Link
                href={`/establishments?localAuthority=${establishment.localAuthorityCode}`}
                className="underline"
              >
                {establishment.localAuthorityName}
              </Link>
            </p>
          </section>

          {hasCoordinates && (
            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">Location</h2>
              <SingleMarkerMapDynamic
                lat={establishment.latitude as number}
                lon={establishment.longitude as number}
                label={establishment.businessName}
                ratingKey={establishment.ratingKey}
                tileUrl={TILE_URL}
                attribution={ATTRIBUTION}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Coordinates as supplied by the local authority, not independently verified. See{" "}
                <Link href="/about/data" className="underline">
                  about the data
                </Link>
                .
              </p>
            </section>
          )}

          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Rating history</h2>
            {ratingChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recorded rating changes since this establishment was first indexed.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Changed</TableHead>
                      <TableHead>Previous rating</TableHead>
                      <TableHead>New rating</TableHead>
                      <TableHead>Previous rating date</TableHead>
                      <TableHead>New rating date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ratingChanges.map((change) => (
                      <TableRow key={change.id}>
                        <TableCell>{formatDate(change.changedAt)}</TableCell>
                        <TableCell>{change.previousRatingValue ?? "-"}</TableCell>
                        <TableCell>{change.newRatingValue ?? "-"}</TableCell>
                        <TableCell>{formatDate(change.previousRatingDate)}</TableCell>
                        <TableCell>{formatDate(change.newRatingDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border bg-card p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-muted-foreground">
                As recorded in the source extract dated{" "}
                <strong className="text-foreground">
                  {formatDate(establishment.sourceExtractDate)}
                </strong>
                , this may not reflect the current rating. Ratings are updated by local authorities
                and re-synced by our nightly ingestion; check{" "}
                <Link
                  href={`https://ratings.food.gov.uk/`}
                  className="underline"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  the FSA&apos;s own site
                </Link>{" "}
                for the most current information.
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4 text-sm">
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">FHRS ID</dt>
                <dd className="tabular-nums">{establishment.fhrsId}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Scheme</dt>
                <dd>{establishment.schemeType}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">First seen</dt>
                <dd>{formatDate(establishment.firstSeenAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Last seen</dt>
                <dd>{formatDate(establishment.lastSeenAt)}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
