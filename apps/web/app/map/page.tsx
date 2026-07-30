import type { Metadata } from "next";
import { MapExplorerDynamic } from "@/components/map/map-explorer-dynamic";
import { listBusinessTypes, listLocalAuthoritiesForFilter } from "@/lib/data/establishments";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Map",
  description: "Interactive map of UK food hygiene rated establishments.",
};

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? "&copy; OpenStreetMap contributors";

export default async function MapPage() {
  const [businessTypes, localAuthorities] = await Promise.all([
    listBusinessTypes(),
    listLocalAuthoritiesForFilter(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Map</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pan and zoom to load establishments in view. A text list of the same results is provided
          below the map for anyone who can&apos;t use the interactive map.
        </p>
      </div>
      <MapExplorerDynamic
        businessTypes={businessTypes}
        localAuthorities={localAuthorities}
        tileUrl={TILE_URL}
        attribution={ATTRIBUTION}
      />
    </div>
  );
}
