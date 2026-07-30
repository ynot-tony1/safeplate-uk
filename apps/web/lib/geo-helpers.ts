const KM_PER_DEGREE_LAT = 111;
const MIN_COS_LAT = 0.01;

export interface DegreeBoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Converts a center point + radius (km) into a lat/lon degree bounding box,
 * used to prefilter establishments via the indexed [latitude, longitude]
 * range before computing exact haversine distance in application code (see
 * lib/data/establishments.ts). Clamps the cosine term near the poles so the
 * longitude delta never blows up — not a real concern for UK latitudes, but
 * keeps the function well-defined everywhere.
 */
export function computeBoundingBoxForRadius(
  lat: number,
  lon: number,
  radiusKm: number,
): DegreeBoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lonDelta = radiusKm / (KM_PER_DEGREE_LAT * (Math.abs(cosLat) > MIN_COS_LAT ? cosLat : MIN_COS_LAT));

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}
