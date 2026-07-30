"use client";

import dynamic from "next/dynamic";

export const MapExplorerDynamic = dynamic(
  () => import("./map-explorer").then((m) => m.MapExplorer),
  {
    ssr: false,
    loading: () => (
      <div
        style={{ height: 520 }}
        className="flex items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground"
      >
        Loading map…
      </div>
    ),
  },
);
