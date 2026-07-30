"use client";

import "leaflet/dist/leaflet.css";
// react-leaflet-cluster bundles its own copy of the leaflet.markercluster
// stylesheets as assets — leaflet.markercluster itself is only its transitive
// dependency, not one of ours, so we import through the package we actually
// depend on directly rather than reaching into a phantom dependency.
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { LatLngBounds } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { RATING_KEYS } from "@safeplate/shared";
import { AlertTriangle } from "lucide-react";
import { RatingBadge } from "@/components/rating-badge";
import { ratingMarkerIcon } from "./marker-icon";
import { ratingLabel } from "@/lib/rating-labels";
import type { BusinessType, LocalAuthority } from "@safeplate/database";

// Centered/zoomed so the initial viewport comfortably fits under the
// bounding-box API's 10-degree span cap (see isValidBoundingBox) — a
// whole-UK view at low zoom exceeds that cap and would 400 on first load.
const UK_CENTER: [number, number] = [52.9, -1.8];
const UK_DEFAULT_ZOOM = 7;
const RESULTS_PER_PAGE = 20;

interface MapMarkerDto {
  fhrsId: string;
  businessName: string;
  businessTypeName: string | null;
  ratingKey: string | null;
  ratingValue: string | null;
  schemeType: string;
  localAuthorityName: string;
  latitude: number;
  longitude: number;
}

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const nativeSelectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function boundsFromLeaflet(b: LatLngBounds): Bounds {
  return {
    minLat: b.getSouth(),
    maxLat: b.getNorth(),
    minLon: b.getWest(),
    maxLon: b.getEast(),
  };
}

function BoundsWatcher({ onChange }: { onChange: (bounds: Bounds) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(boundsFromLeaflet(map.getBounds())),
  });
  useEffect(() => {
    onChange(boundsFromLeaflet(map.getBounds()));
    // Only run once, on mount, to seed the initial viewport fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function MapExplorer({
  businessTypes,
  localAuthorities,
  tileUrl,
  attribution,
}: {
  businessTypes: BusinessType[];
  localAuthorities: LocalAuthority[];
  tileUrl: string;
  attribution: string;
}) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [rating, setRating] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [localAuthority, setLocalAuthority] = useState("");
  const [markers, setMarkers] = useState<MapMarkerDto[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const requestIdRef = useRef(0);

  const fetchMarkers = useCallback(
    async (b: Bounds) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({
        minLat: String(b.minLat),
        maxLat: String(b.maxLat),
        minLon: String(b.minLon),
        maxLon: String(b.maxLon),
      });
      if (rating) qs.set("rating", rating);
      if (businessType) qs.set("businessType", businessType);
      if (localAuthority) qs.set("localAuthority", localAuthority);

      try {
        const res = await fetch(`/api/map/establishments?${qs.toString()}`);
        if (requestId !== requestIdRef.current) return; // stale response
        if (res.status === 400) {
          // The viewport is too large for the bounding-box cap (see
          // isValidBoundingBox) — not a failure, just needs a smaller area.
          setMarkers([]);
          setTruncated(false);
          setError("Zoom in further to load establishments — the current area is too large to query.");
          setPage(0);
          return;
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        setMarkers(data.establishments ?? []);
        setTruncated(Boolean(data.truncated));
        setPage(0);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setError("Couldn't load establishments for this area. Try again shortly.");
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [rating, businessType, localAuthority],
  );

  useEffect(() => {
    // Standard "refetch when viewport/filters change" data-fetching effect.
    // fetchMarkers is async and only calls setState after an await, but the
    // stricter react-hooks v7 heuristic still flags calling it from an
    // effect body — this is the correct, race-safe pattern (see
    // requestIdRef above), so it's suppressed rather than restructured.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (bounds) fetchMarkers(bounds);
  }, [bounds, fetchMarkers]);

  const totalPages = Math.max(1, Math.ceil(markers.length / RESULTS_PER_PAGE));
  const pageItems = useMemo(
    () => markers.slice(page * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE + RESULTS_PER_PAGE),
    [markers, page],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <label className="flex items-center gap-2 text-sm">
          Rating
          <select
            className={nativeSelectClass}
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            aria-label="Filter by rating"
          >
            <option value="">Any</option>
            {RATING_KEYS.map((key) => (
              <option key={key} value={key}>
                {ratingLabel(key)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          Business type
          <select
            className={nativeSelectClass}
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            aria-label="Filter by business type"
          >
            <option value="">Any</option>
            {businessTypes.map((bt) => (
              <option key={bt.id} value={bt.id}>
                {bt.description}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          Local authority
          <select
            className={nativeSelectClass}
            value={localAuthority}
            onChange={(e) => setLocalAuthority(e.target.value)}
            aria-label="Filter by local authority"
          >
            <option value="">Any</option>
            {localAuthorities.map((la) => (
              <option key={la.code} value={la.code}>
                {la.name}
              </option>
            ))}
          </select>
        </label>

        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      {truncated && (
        <p className="flex items-center gap-2 rounded-md border border-[var(--chart-warning)]/40 bg-[var(--chart-warning)]/10 p-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-[var(--chart-warning)]" aria-hidden="true" />
          Showing the first {markers.length} results in this area. Zoom in to see all establishments.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MapContainer
            center={UK_CENTER}
            zoom={UK_DEFAULT_ZOOM}
            style={{ height: 520, width: "100%", borderRadius: 8 }}
            aria-label="Map of establishments in the current viewport"
          >
            <TileLayer url={tileUrl} attribution={attribution} />
            <BoundsWatcher onChange={setBounds} />
            <MarkerClusterGroup chunkedLoading>
              {markers.map((m) => (
                <Marker key={m.fhrsId} position={[m.latitude, m.longitude]} icon={ratingMarkerIcon(m.ratingKey)}>
                  <Popup>
                    <div className="space-y-1">
                      <p className="font-medium">{m.businessName}</p>
                      <p className="text-xs text-muted-foreground">{m.businessTypeName}</p>
                      <p className="text-xs">{ratingLabel(m.ratingKey)}</p>
                      <Link href={`/establishments/${m.fhrsId}`} className="text-xs underline">
                        View details
                      </Link>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          </MapContainer>
        </div>

        <section aria-label="Establishments in view (accessible text alternative to the map)" className="space-y-3">
          <h2 className="text-sm font-semibold">Establishments in view ({markers.length})</h2>
          {pageItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No establishments with coordinates in the current map area.
            </p>
          ) : (
            <ul className="max-h-[460px] space-y-2 overflow-y-auto">
              {pageItems.map((m) => (
                <li key={m.fhrsId} className="rounded-md border bg-card p-3 text-sm">
                  <Link href={`/establishments/${m.fhrsId}`} className="font-medium hover:underline">
                    {m.businessName}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {m.businessTypeName ?? "Business type not recorded"} · {m.localAuthorityName}
                  </p>
                  <div className="mt-1.5">
                    <RatingBadge ratingKey={m.ratingKey} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                className="rounded-md border px-2 py-1 disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </button>
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                className="rounded-md border px-2 py-1 disabled:opacity-40"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
