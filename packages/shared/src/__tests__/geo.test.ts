import { describe, expect, it } from "vitest";
import { distanceKm, isValidBoundingBox, isValidUkCoordinate } from "../geo";

describe("isValidUkCoordinate", () => {
  it("accepts a coordinate within the UK", () => {
    expect(isValidUkCoordinate(51.5074, -0.1278)).toBe(true); // London
  });

  it("rejects null coordinates", () => {
    expect(isValidUkCoordinate(null, -0.1278)).toBe(false);
    expect(isValidUkCoordinate(51.5074, null)).toBe(false);
  });

  it("rejects NaN coordinates", () => {
    expect(isValidUkCoordinate(Number.NaN, -0.1278)).toBe(false);
  });

  it("rejects a coordinate far outside the UK", () => {
    expect(isValidUkCoordinate(40.7128, -74.006)).toBe(false); // New York
  });
});

describe("isValidBoundingBox", () => {
  it("accepts a small well-ordered box within the UK", () => {
    expect(
      isValidBoundingBox({ minLat: 51.4, maxLat: 51.6, minLon: -0.2, maxLon: 0.0 }),
    ).toBe(true);
  });

  it("rejects an inverted box", () => {
    expect(
      isValidBoundingBox({ minLat: 51.6, maxLat: 51.4, minLon: -0.2, maxLon: 0.0 }),
    ).toBe(false);
  });

  it("rejects a box exceeding the max span", () => {
    expect(
      isValidBoundingBox({ minLat: 40, maxLat: 60, minLon: -10, maxLon: 10 }),
    ).toBe(false);
  });

  it("rejects a box far outside the UK", () => {
    expect(
      isValidBoundingBox({ minLat: -10, maxLat: -5, minLon: 100, maxLon: 105 }),
    ).toBe(false);
  });
});

describe("distanceKm", () => {
  it("returns ~0 for identical points", () => {
    const p = { lat: 51.5074, lon: -0.1278 };
    expect(distanceKm(p, p)).toBeCloseTo(0, 5);
  });

  it("computes a plausible distance between London and Manchester", () => {
    const london = { lat: 51.5074, lon: -0.1278 };
    const manchester = { lat: 53.4808, lon: -2.2426 };
    const d = distanceKm(london, manchester);
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(300);
  });
});
