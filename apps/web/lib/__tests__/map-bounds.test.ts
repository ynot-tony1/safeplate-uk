import { describe, expect, it } from "vitest";
import { isValidBoundingBox, mapBoundsParamsSchema } from "@safeplate/shared";

/**
 * Exercises the same validation pipeline app/api/map/establishments/route.ts
 * runs on every request: parse query params with the shared zod schema, then
 * check the resulting box with isValidBoundingBox before ever touching the
 * database. This is what stops a client from requesting an unbounded or
 * malformed viewport and forcing a full-table scan.
 */
function parseAndValidate(raw: Record<string, string>) {
  const parsed = mapBoundsParamsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, reason: "schema" as const };
  if (!isValidBoundingBox(parsed.data)) return { ok: false as const, reason: "bbox" as const };
  return { ok: true as const, data: parsed.data };
}

describe("map viewport bounds validation", () => {
  it("accepts a sensible UK-sized viewport", () => {
    const result = parseAndValidate({
      minLat: "51.4",
      maxLat: "51.6",
      minLon: "-0.3",
      maxLon: "0.1",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a box where min >= max", () => {
    const result = parseAndValidate({
      minLat: "51.6",
      maxLat: "51.4",
      minLon: "-0.3",
      maxLon: "0.1",
    });
    expect(result).toEqual({ ok: false, reason: "bbox" });
  });

  it("rejects an oversized box (would force a full scan)", () => {
    const result = parseAndValidate({
      minLat: "-80",
      maxLat: "80",
      minLon: "-170",
      maxLon: "170",
    });
    expect(result).toEqual({ ok: false, reason: "bbox" });
  });

  it("rejects a box entirely outside plausible UK bounds", () => {
    const result = parseAndValidate({
      minLat: "10",
      maxLat: "12",
      minLon: "100",
      maxLon: "102",
    });
    expect(result).toEqual({ ok: false, reason: "bbox" });
  });

  it("rejects missing required fields at the schema layer", () => {
    const result = parseAndValidate({ minLat: "51.4", maxLat: "51.6" });
    expect(result).toEqual({ ok: false, reason: "schema" });
  });

  it("applies optional filters (rating/businessType/localAuthority) when present", () => {
    const result = parseAndValidate({
      minLat: "51.4",
      maxLat: "51.6",
      minLon: "-0.3",
      maxLon: "0.1",
      rating: "5",
      businessType: "7844",
      localAuthority: "E09000033",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rating).toBe("5");
      expect(result.data.businessType).toBe(7844);
      expect(result.data.localAuthority).toBe("E09000033");
    }
  });

  it("rejects an invalid rating filter value", () => {
    const result = parseAndValidate({
      minLat: "51.4",
      maxLat: "51.6",
      minLon: "-0.3",
      maxLon: "0.1",
      rating: "six-stars",
    });
    expect(result).toEqual({ ok: false, reason: "schema" });
  });
});
