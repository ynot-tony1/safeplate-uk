import { describe, expect, it } from "vitest";
import { distanceKm } from "@safeplate/shared";
import { computeBoundingBoxForRadius } from "../geo-helpers";

describe("computeBoundingBoxForRadius", () => {
  it("produces a symmetric box around the center point", () => {
    const box = computeBoundingBoxForRadius(51.5, -0.12, 10);
    const centerLat = (box.minLat + box.maxLat) / 2;
    const centerLon = (box.minLon + box.maxLon) / 2;
    expect(centerLat).toBeCloseTo(51.5, 6);
    expect(centerLon).toBeCloseTo(-0.12, 6);
  });

  it("grows with radius", () => {
    const small = computeBoundingBoxForRadius(51.5, -0.12, 5);
    const large = computeBoundingBoxForRadius(51.5, -0.12, 50);
    expect(large.maxLat - large.minLat).toBeGreaterThan(small.maxLat - small.minLat);
    expect(large.maxLon - large.minLon).toBeGreaterThan(small.maxLon - small.minLon);
  });

  it("contains every point within the requested radius (haversine cross-check)", () => {
    const center = { lat: 53.4808, lon: -2.2426 }; // Manchester
    const radiusKm = 8;
    const box = computeBoundingBoxForRadius(center.lat, center.lon, radiusKm);

    // Sample points at the box's corners must be *outside or at* the true
    // circle only because the box is a superset of the circle (that's the
    // point of a bounding-box prefilter) — but every point *within* the
    // radius must fall inside the box.
    const insidePoint = { lat: center.lat + 0.01, lon: center.lon + 0.01 };
    expect(distanceKm(center, insidePoint)).toBeLessThan(radiusKm);
    expect(insidePoint.lat).toBeGreaterThanOrEqual(box.minLat);
    expect(insidePoint.lat).toBeLessThanOrEqual(box.maxLat);
    expect(insidePoint.lon).toBeGreaterThanOrEqual(box.minLon);
    expect(insidePoint.lon).toBeLessThanOrEqual(box.maxLon);
  });

  it("widens the longitude delta at higher latitudes (meridians converge)", () => {
    const low = computeBoundingBoxForRadius(10, 0, 20);
    const high = computeBoundingBoxForRadius(60, 0, 20);
    const lowLonSpan = low.maxLon - low.minLon;
    const highLonSpan = high.maxLon - high.minLon;
    expect(highLonSpan).toBeGreaterThan(lowLonSpan);
  });

  it("stays well-defined near the pole (does not divide by ~0)", () => {
    const box = computeBoundingBoxForRadius(89.9, 0, 10);
    expect(Number.isFinite(box.minLon)).toBe(true);
    expect(Number.isFinite(box.maxLon)).toBe(true);
  });
});

describe("distanceKm (shared)", () => {
  it("returns ~0 for identical points", () => {
    const point = { lat: 51.5, lon: -0.1 };
    expect(distanceKm(point, point)).toBeCloseTo(0, 6);
  });

  it("computes a known distance (London to Manchester, roughly)", () => {
    const london = { lat: 51.5072, lon: -0.1276 };
    const manchester = { lat: 53.4808, lon: -2.2426 };
    const km = distanceKm(london, manchester);
    // Real-world great-circle distance is ~262km — allow generous tolerance.
    expect(km).toBeGreaterThan(200);
    expect(km).toBeLessThan(320);
  });
});
