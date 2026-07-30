/** UK-plausible bounding box (generous, includes Channel Islands / N. Ireland). */
export const UK_BOUNDS = {
  minLat: 49.8,
  maxLat: 61.0,
  minLon: -8.7,
  maxLon: 1.9,
} as const;

export function isValidUkCoordinate(lat: number | null, lon: number | null): boolean {
  if (lat == null || lon == null) return false;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
  return (
    lat >= UK_BOUNDS.minLat &&
    lat <= UK_BOUNDS.maxLat &&
    lon >= UK_BOUNDS.minLon &&
    lon <= UK_BOUNDS.maxLon
  );
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const MAX_BBOX_SPAN_DEGREES = 10;

/** Validates a viewport bounding box: ordered, within UK bounds, and not absurdly large. */
export function isValidBoundingBox(box: BoundingBox): boolean {
  if (box.minLat >= box.maxLat || box.minLon >= box.maxLon) return false;
  if (box.maxLat - box.minLat > MAX_BBOX_SPAN_DEGREES) return false;
  if (box.maxLon - box.minLon > MAX_BBOX_SPAN_DEGREES) return false;
  if (box.minLat < UK_BOUNDS.minLat - 1 || box.maxLat > UK_BOUNDS.maxLat + 1) return false;
  if (box.minLon < UK_BOUNDS.minLon - 1 || box.maxLon > UK_BOUNDS.maxLon + 1) return false;
  return true;
}

/** Haversine distance in kilometres, used for distance-sort of search results. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}
