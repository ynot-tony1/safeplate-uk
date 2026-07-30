"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { ratingMarkerIcon } from "./marker-icon";

export function SingleMarkerMap({
  lat,
  lon,
  label,
  ratingKey,
  tileUrl,
  attribution,
}: {
  lat: number;
  lon: number;
  label: string;
  ratingKey: string | null | undefined;
  tileUrl: string;
  attribution: string;
}) {
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={16}
      scrollWheelZoom={false}
      style={{ height: 280, width: "100%", borderRadius: 8 }}
      aria-label={`Map showing the location of ${label}`}
    >
      <TileLayer url={tileUrl} attribution={attribution} />
      <Marker position={[lat, lon]} icon={ratingMarkerIcon(ratingKey)}>
        <Popup>{label}</Popup>
      </Marker>
    </MapContainer>
  );
}
