import { describe, expect, it } from "vitest";
import { establishmentSearchParamsSchema } from "@safeplate/shared";
import { flattenSearchParams } from "../search-params";

describe("flattenSearchParams", () => {
  it("takes the first value for array params and drops undefined/empty", () => {
    const flat = flattenSearchParams({
      q: "chicken",
      rating: ["5", "4"],
      postcode: undefined,
      businessType: "",
    });
    expect(flat).toEqual({ q: "chicken", rating: "5" });
  });

  it("returns an empty object for an empty input", () => {
    expect(flattenSearchParams({})).toEqual({});
  });
});

describe("establishmentSearchParamsSchema (search filter validation)", () => {
  it("applies defaults when given no params", () => {
    const parsed = establishmentSearchParamsSchema.parse({});
    expect(parsed.sort).toBe("business_name");
    expect(parsed.direction).toBe("asc");
    expect(parsed.limit).toBe(20);
  });

  it("accepts a fully-specified filter set", () => {
    const result = establishmentSearchParamsSchema.safeParse({
      q: "The Anchor",
      postcode: "SW1A 1AA",
      localAuthority: "E09000033",
      businessType: "7844",
      rating: "5",
      scheme: "FHRS",
      ratingDateFrom: "2024-01-01",
      ratingDateTo: "2024-12-31",
      newRatingPending: "true",
      sort: "rating_date",
      direction: "desc",
      limit: "50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessType).toBe(7844);
      expect(result.data.newRatingPending).toBe(true);
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects an invalid rating key", () => {
    const result = establishmentSearchParamsSchema.safeParse({ rating: "not-a-rating" });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range limit", () => {
    expect(establishmentSearchParamsSchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(establishmentSearchParamsSchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects a malformed rating date", () => {
    const result = establishmentSearchParamsSchema.safeParse({ ratingDateFrom: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("accepts distance-search params together", () => {
    const result = establishmentSearchParamsSchema.safeParse({
      lat: "51.5",
      lon: "-0.12",
      radiusKm: "10",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a radius over the 100km cap", () => {
    const result = establishmentSearchParamsSchema.safeParse({
      lat: "51.5",
      lon: "-0.1",
      radiusKm: "150",
    });
    expect(result.success).toBe(false);
  });
});
