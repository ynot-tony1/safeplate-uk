import "server-only";
import { prisma } from "@safeplate/database";
import type { Establishment, Prisma } from "@safeplate/database";
import type { MapBoundsParams } from "@safeplate/shared";

export const MAP_RESULT_CAP = 500;

export interface MapQueryResult {
  items: Establishment[];
  truncated: boolean;
}

/**
 * Establishments within a viewport bounding box, capped at MAP_RESULT_CAP and
 * ordered deterministically (rating severity then name) so the same viewport
 * returns a stable, sensible subset instead of an arbitrary one. Never
 * returns the whole table — the bounding box plus the index on
 * [latitude, longitude] keep this a bounded range scan.
 */
export async function getEstablishmentsInBounds(params: MapBoundsParams): Promise<MapQueryResult> {
  const and: Prisma.EstablishmentWhereInput[] = [
    { isActive: true },
    { latitude: { gte: params.minLat, lte: params.maxLat } },
    { longitude: { gte: params.minLon, lte: params.maxLon } },
  ];

  if (params.rating) and.push({ ratingKey: params.rating });
  if (params.businessType != null) and.push({ businessTypeId: params.businessType });
  if (params.localAuthority) and.push({ localAuthorityCode: params.localAuthority });

  const rows = await prisma.establishment.findMany({
    where: { AND: and },
    orderBy: [{ ratingKey: "asc" }, { businessName: "asc" }],
    take: MAP_RESULT_CAP + 1,
  });

  return {
    items: rows.slice(0, MAP_RESULT_CAP),
    truncated: rows.length > MAP_RESULT_CAP,
  };
}
