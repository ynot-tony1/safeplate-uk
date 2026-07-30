"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at import time, so it must never render during
// SSR — load it lazily, client-side only.
export const SingleMarkerMapDynamic = dynamic(
  () => import("./single-marker-map").then((m) => m.SingleMarkerMap),
  {
    ssr: false,
    loading: () => (
      <div
        style={{ height: 280 }}
        className="flex items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground"
      >
        Loading map…
      </div>
    ),
  },
);
