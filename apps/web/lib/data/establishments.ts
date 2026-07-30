import "server-only";
import { prisma } from "@safeplate/database";
import type { Establishment, Prisma } from "@safeplate/database";
import {
  distanceKm,
  isValidUkCoordinate,
  normaliseName,
  normalisePostcode,
  postcodePrefix,
  type EstablishmentSearchParams,
} from "@safeplate/shared";
import { buildNullBucketWhere, decodeCursor, encodeCursor, type Cursor } from "../pagination";
import { computeBoundingBoxForRadius } from "../geo-helpers";

const MAX_DISTANCE_PREFILTER_ROWS = 500;
const DEFAULT_RADIUS_KM = 5;

export interface EstablishmentWithDistance extends Establishment {
  distanceKm: number | null;
}

export interface SearchResult {
  items: EstablishmentWithDistance[];
  nextCursor: string | null;
  hasMore: boolean;
  mode: "list" | "distance";
}

type SortColumn = "normalisedName" | "ratingKey" | "ratingDate";

const SORT_COLUMN_BY_FIELD: Record<EstablishmentSearchParams["sort"], SortColumn> = {
  business_name: "normalisedName",
  rating: "ratingKey",
  rating_date: "ratingDate",
};

/** Shared filter predicates that apply regardless of sort mode or pagination style. */
function buildBaseWhere(params: EstablishmentSearchParams): Prisma.EstablishmentWhereInput {
  const and: Prisma.EstablishmentWhereInput[] = [{ isActive: true }];

  if (params.q) {
    and.push({ normalisedName: { startsWith: normaliseName(params.q) } });
  }

  if (params.postcode) {
    const normalised = normalisePostcode(params.postcode);
    if (normalised) {
      and.push({ postcodePrefix: postcodePrefix(normalised) });
    } else {
      and.push({
        postcodePrefix: { startsWith: params.postcode.trim().toUpperCase() },
      });
    }
  }

  if (params.localAuthority) {
    and.push({ localAuthorityCode: params.localAuthority });
  }

  if (params.businessType != null) {
    and.push({ businessTypeId: params.businessType });
  }

  if (params.rating) {
    and.push({ ratingKey: params.rating });
  }

  if (params.scheme) {
    and.push({ schemeType: params.scheme });
  }

  if (params.ratingDateFrom || params.ratingDateTo) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (params.ratingDateFrom) range.gte = new Date(params.ratingDateFrom);
    if (params.ratingDateTo) range.lte = new Date(params.ratingDateTo);
    and.push({ ratingDate: range });
  }

  if (params.newRatingPending != null) {
    and.push({ newRatingPending: params.newRatingPending });
  }

  return { AND: and };
}

function extractSortValue(row: Establishment, column: SortColumn): string | null {
  const value = row[column];
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function coerceCursorValueForColumn(column: SortColumn, raw: string): string | Date {
  return column === "ratingDate" ? new Date(raw) : raw;
}

// normalisedName is a required (non-nullable) column in the schema — Prisma
// rejects `{ not: null }` against a non-nullable String field, and there's
// no null bucket to top up from, so only ratingKey/ratingDate (both
// nullable) need the two-query nulls-last dance.
const NULLABLE_SORT_COLUMNS = new Set<SortColumn>(["ratingKey", "ratingDate"]);

async function fetchKeysetPage(
  baseWhere: Prisma.EstablishmentWhereInput,
  column: SortColumn,
  direction: "asc" | "desc",
  cursor: Cursor | null,
  limit: number,
): Promise<{ items: Establishment[]; hasMore: boolean; nextCursor: string | null }> {
  const take = limit + 1;
  const nullable = NULLABLE_SORT_COLUMNS.has(column);
  const inNullBucket = nullable && cursor?.v === null;
  let rows: Establishment[] = [];

  if (!inNullBucket) {
    // buildKeysetWhereTyped mirrors lib/pagination.ts's buildKeysetWhere but
    // coerces the cursor value to a Date for the ratingDate column, since
    // Prisma compares DateTime fields against Date instances, not strings.
    const keysetWhere =
      cursor && cursor.v !== null
        ? buildKeysetWhereTyped(
            column,
            direction,
            coerceCursorValueForColumn(column, cursor.v),
            cursor.id,
          )
        : undefined;

    rows = await prisma.establishment.findMany({
      where: {
        AND: [
          baseWhere,
          ...(nullable ? [{ [column]: { not: null } }] : []),
          ...(keysetWhere ? [keysetWhere] : []),
        ],
      },
      orderBy: [{ [column]: direction }, { fhrsId: direction }],
      take,
    });
  }

  if (nullable && rows.length < take) {
    const remaining = take - rows.length;
    const nullCursor = inNullBucket ? cursor : null;
    const nullWhere = buildNullBucketWhere(direction, nullCursor);
    const nullRows = await prisma.establishment.findMany({
      where: {
        AND: [baseWhere, { [column]: null }, ...(nullWhere ? [nullWhere] : [])],
      },
      orderBy: [{ fhrsId: direction }],
      take: remaining,
    });
    rows = rows.concat(nullRows);
  }

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    const lastIsNull = nullable && last[column] == null;
    nextCursor = encodeCursor({
      v: lastIsNull ? null : extractSortValue(last, column),
      id: last.fhrsId,
    });
  }
  return { items, hasMore, nextCursor };
}

/** Same shape as buildKeysetWhere but with a properly-typed (Date-aware) value. */
function buildKeysetWhereTyped(
  column: SortColumn,
  direction: "asc" | "desc",
  value: string | Date,
  id: string,
): Prisma.EstablishmentWhereInput {
  const cmp = direction === "asc" ? "gt" : "lt";
  return {
    OR: [{ [column]: { [cmp]: value } }, { AND: [{ [column]: value }, { fhrsId: { [cmp]: id } }] }],
  } as Prisma.EstablishmentWhereInput;
}

/**
 * Bounded-box + exact-distance search. Prefilters with a lat/lon range
 * derived from the requested radius (bounded by an index on
 * [latitude, longitude]) rather than scanning the whole table, then computes
 * exact haversine distance in application code and paginates the (capped,
 * already-small) result in memory. See MAX_DISTANCE_PREFILTER_ROWS.
 */
async function fetchDistancePage(
  baseWhere: Prisma.EstablishmentWhereInput,
  lat: number,
  lon: number,
  radiusKm: number,
  cursor: Cursor | null,
  limit: number,
): Promise<{ items: EstablishmentWithDistance[]; hasMore: boolean; nextCursor: string | null }> {
  const box = computeBoundingBoxForRadius(lat, lon, radiusKm);

  const bounded = await prisma.establishment.findMany({
    where: {
      AND: [
        baseWhere,
        { latitude: { gte: box.minLat, lte: box.maxLat } },
        { longitude: { gte: box.minLon, lte: box.maxLon } },
      ],
    },
    orderBy: { fhrsId: "asc" },
    take: MAX_DISTANCE_PREFILTER_ROWS,
  });

  const withDistance: EstablishmentWithDistance[] = bounded
    .filter((e) => isValidUkCoordinate(e.latitude, e.longitude))
    .map((e) => ({
      ...e,
      distanceKm: distanceKm(
        { lat, lon },
        { lat: e.latitude as number, lon: e.longitude as number },
      ),
    }))
    .filter((e) => e.distanceKm !== null && e.distanceKm <= radiusKm)
    .sort((a, b) => {
      const d = (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
      return d !== 0 ? d : a.fhrsId.localeCompare(b.fhrsId);
    });

  let startIndex = 0;
  if (cursor) {
    startIndex = withDistance.findIndex((e) => {
      const d = e.distanceKm ?? 0;
      const cv = Number(cursor.v ?? 0);
      return d > cv || (d === cv && e.fhrsId > cursor.id);
    });
    if (startIndex === -1) startIndex = withDistance.length;
  }

  const page = withDistance.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < withDistance.length;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ v: String(last.distanceKm ?? 0), id: last.fhrsId }) : null;

  return { items: page, hasMore, nextCursor };
}

export async function searchEstablishments(
  params: EstablishmentSearchParams,
): Promise<SearchResult> {
  const baseWhere = buildBaseWhere(params);
  const cursor = params.cursor ? decodeCursor(params.cursor) : null;

  if (params.lat != null && params.lon != null) {
    const radiusKm = params.radiusKm ?? DEFAULT_RADIUS_KM;
    const { items, hasMore, nextCursor } = await fetchDistancePage(
      baseWhere,
      params.lat,
      params.lon,
      radiusKm,
      cursor,
      params.limit,
    );
    return { items, hasMore, nextCursor, mode: "distance" };
  }

  const column = SORT_COLUMN_BY_FIELD[params.sort];
  const { items, hasMore, nextCursor } = await fetchKeysetPage(
    baseWhere,
    column,
    params.direction,
    cursor,
    params.limit,
  );
  return {
    items: items.map((e) => ({ ...e, distanceKm: null })),
    hasMore,
    nextCursor,
    mode: "list",
  };
}

export async function getEstablishmentByFhrsId(fhrsId: string): Promise<Establishment | null> {
  return prisma.establishment.findUnique({ where: { fhrsId } });
}

export async function getRatingChangeHistory(fhrsId: string) {
  return prisma.ratingChange.findMany({
    where: { fhrsId },
    orderBy: { changedAt: "desc" },
  });
}

/** Distinct business types, for the search filter dropdown. */
export async function listBusinessTypes() {
  return prisma.businessType.findMany({ orderBy: { description: "asc" } });
}

/** Distinct local authorities, for the search filter dropdown. */
export async function listLocalAuthoritiesForFilter() {
  return prisma.localAuthority.findMany({ orderBy: { name: "asc" } });
}
