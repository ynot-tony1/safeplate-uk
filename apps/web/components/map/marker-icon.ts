import L from "leaflet";
import { ratingSeverity } from "@/lib/rating-labels";

const SEVERITY_HEX: Record<string, string> = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  neutral: "#898781",
};

const cache = new Map<string, L.DivIcon>();

/**
 * A plain colored circle divIcon rather than the default Leaflet marker
 * image — avoids the classic bundler-breaks-the-default-icon-path problem
 * entirely, and doubles as the rating-severity color cue on the map.
 */
export function ratingMarkerIcon(ratingKey: string | null | undefined): L.DivIcon {
  const severity = ratingSeverity(ratingKey);
  const cached = cache.get(severity);
  if (cached) return cached;

  const color = SEVERITY_HEX[severity];
  const icon = L.divIcon({
    className: "safeplate-marker",
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.35);"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -7],
  });
  cache.set(severity, icon);
  return icon;
}
