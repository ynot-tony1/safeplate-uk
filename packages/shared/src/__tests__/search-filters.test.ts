import { describe, expect, it } from "vitest";
import { establishmentSearchParamsSchema, mapBoundsParamsSchema } from "../search-filters";

describe("establishmentSearchParamsSchema", () => {
  it("applies defaults when no params are given", () => {
    const result = establishmentSearchParamsSchema.parse({});
    expect(result.sort).toBe("business_name");
    expect(result.direction).toBe("asc");
    expect(result.limit).toBe(20);
  });

  it("coerces numeric/boolean query-string values", () => {
    const result = establishmentSearchParamsSchema.parse({
      businessType: "7843",
      newRatingPending: "true",
      lat: "51.5",
      lon: "-0.12",
      limit: "50",
    });
    expect(result.businessType).toBe(7843);
    expect(result.newRatingPending).toBe(true);
    expect(result.lat).toBeCloseTo(51.5);
    expect(result.limit).toBe(50);
  });

  it("rejects a limit above the max", () => {
    expect(() => establishmentSearchParamsSchema.parse({ limit: "500" })).toThrow();
  });

  it("rejects an invalid rating key", () => {
    expect(() => establishmentSearchParamsSchema.parse({ rating: "six" })).toThrow();
  });

  it("rejects a malformed rating date", () => {
    expect(() => establishmentSearchParamsSchema.parse({ ratingDateFrom: "not-a-date" })).toThrow();
  });
});

describe("mapBoundsParamsSchema", () => {
  it("parses a valid bounding box", () => {
    const result = mapBoundsParamsSchema.parse({
      minLat: "51.4",
      maxLat: "51.6",
      minLon: "-0.2",
      maxLon: "0.0",
    });
    expect(result.minLat).toBeCloseTo(51.4);
    expect(result.maxLat).toBeCloseTo(51.6);
  });

  it("rejects an out-of-range latitude", () => {
    expect(() =>
      mapBoundsParamsSchema.parse({ minLat: "200", maxLat: "51.6", minLon: "-0.2", maxLon: "0.0" }),
    ).toThrow();
  });
});
