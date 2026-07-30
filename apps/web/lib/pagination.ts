/**
 * Keyset (cursor) pagination helpers, shared by /establishments and any other
 * list view that needs stable pagination over a large, changing table without
 * the performance cliff of OFFSET pagination.
 *
 * A cursor encodes the sort-field value and the fhrsId tiebreaker of the last
 * row seen on the previous page. `v: null` means "the last row seen had a
 * null sort value" — i.e. we are already inside the nulls-last bucket.
 */

export interface Cursor {
  v: string | null;
  id: string;
}

/** Encodes a cursor as an opaque, URL-safe string. */
export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, "utf8").toString("base64url");
}

/** Decodes a cursor produced by {@link encodeCursor}. Returns null if malformed. */
export function decodeCursor(raw: string): Cursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      typeof (parsed as { id: unknown }).id === "string"
    ) {
      const v = (parsed as { v?: unknown }).v;
      return {
        v: v === null || v === undefined ? null : String(v),
        id: (parsed as { id: string }).id,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export type SortDirection = "asc" | "desc";

/**
 * Builds a Prisma `where` fragment implementing keyset pagination on
 * (sortField, fhrsId) for rows where `sortField` is NOT null. Nulls are
 * always sorted last regardless of direction — handle the null bucket
 * separately (see `lib/data/establishments.ts`).
 */
export function buildKeysetWhere(
  sortField: string,
  direction: SortDirection,
  cursor: Cursor | null,
): Record<string, unknown> | undefined {
  if (!cursor || cursor.v === null) return undefined;
  const cmp = direction === "asc" ? "gt" : "lt";
  return {
    OR: [
      { [sortField]: { [cmp]: cursor.v } },
      {
        AND: [{ [sortField]: cursor.v }, { fhrsId: { [cmp]: cursor.id } }],
      },
    ],
  };
}

/** Builds the keyset predicate for the nulls bucket, ordered by fhrsId only. */
export function buildNullBucketWhere(
  direction: SortDirection,
  cursor: Cursor | null,
): Record<string, unknown> | undefined {
  if (!cursor || cursor.v !== null) return undefined;
  const cmp = direction === "asc" ? "gt" : "lt";
  return { fhrsId: { [cmp]: cursor.id } };
}
