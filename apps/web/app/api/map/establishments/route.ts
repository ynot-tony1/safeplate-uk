import { NextResponse } from "next/server";
import { isValidBoundingBox, mapBoundsParamsSchema } from "@safeplate/shared";
import { getEstablishmentsInBounds } from "@/lib/data/map";

export const dynamic = "force-dynamic";

/**
 * Returns establishments within a map viewport. Always bounded — validates
 * the box shape/size and caps the row count server-side (see lib/data/map.ts)
 * so a client can never trigger a full-table scan by requesting an
 * enormous or malformed bounding box.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = mapBoundsParamsSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (!isValidBoundingBox(parsed.data)) {
    return NextResponse.json({ error: "Invalid or oversized bounding box" }, { status: 400 });
  }

  const { items, truncated } = await getEstablishmentsInBounds(parsed.data);

  const markers = items
    .filter((e) => e.latitude != null && e.longitude != null)
    .map((e) => ({
      fhrsId: e.fhrsId,
      businessName: e.businessName,
      businessTypeName: e.businessTypeName,
      ratingKey: e.ratingKey,
      ratingValue: e.ratingValue,
      schemeType: e.schemeType,
      localAuthorityName: e.localAuthorityName,
      latitude: e.latitude,
      longitude: e.longitude,
    }));

  return NextResponse.json({ establishments: markers, truncated, count: markers.length });
}
