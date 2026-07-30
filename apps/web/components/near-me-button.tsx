"use client";

import { useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Progressive enhancement: fills hidden lat/lon inputs from the browser's
 * geolocation API and submits the enclosing form. The form works perfectly
 * well without this (plain text/select filters + GET submit) — this just
 * adds a distance-search shortcut for JS-enabled browsers.
 */
export function NearMeButton({
  defaultLat,
  defaultLon,
  defaultRadius,
}: {
  defaultLat?: string;
  defaultLon?: string;
  defaultRadius?: string;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const latRef = useRef<HTMLInputElement>(null);
  const lonRef = useRef<HTMLInputElement>(null);

  function handleClick() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (latRef.current) latRef.current.value = String(position.coords.latitude);
        if (lonRef.current) lonRef.current.value = String(position.coords.longitude);
        setStatus("idle");
        latRef.current?.closest("form")?.requestSubmit();
      },
      () => setStatus("error"),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <input ref={latRef} type="hidden" name="lat" defaultValue={defaultLat} />
      <input ref={lonRef} type="hidden" name="lon" defaultValue={defaultLon} />
      <label htmlFor="radiusKm" className="sr-only">
        Search radius (km)
      </label>
      <input
        id="radiusKm"
        name="radiusKm"
        type="number"
        min={1}
        max={100}
        defaultValue={defaultRadius ?? "5"}
        className="h-9 w-16 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
        aria-label="Search radius in kilometres"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={status === "locating"}
      >
        <LocateFixed className="size-4" aria-hidden="true" />
        {status === "locating" ? "Locating…" : "Near me"}
      </Button>
      {status === "error" && (
        <span role="alert" className="text-xs text-destructive">
          Couldn&apos;t get your location.
        </span>
      )}
    </div>
  );
}
