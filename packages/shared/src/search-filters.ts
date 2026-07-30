import { z } from "zod";
import { RATING_KEYS, SCHEME_TYPES, SORTABLE_FIELDS, SORT_DIRECTIONS } from "./scheme";

/**
 * URL-query-parameter contract for /establishments. Kept as a single Zod
 * schema so the server data layer and any client-side link-building share
 * one definition of what a valid filter set looks like.
 */
export const establishmentSearchParamsSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  postcode: z.string().trim().min(1).max(10).optional(),
  localAuthority: z.string().trim().min(1).max(20).optional(),
  businessType: z.coerce.number().int().positive().optional(),
  rating: z.enum(RATING_KEYS).optional(),
  scheme: z.enum(SCHEME_TYPES).optional(),
  ratingDateFrom: z.string().date().optional(),
  ratingDateTo: z.string().date().optional(),
  newRatingPending: z.coerce.boolean().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
  sort: z.enum(SORTABLE_FIELDS).default("business_name"),
  direction: z.enum(SORT_DIRECTIONS).default("asc"),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type EstablishmentSearchParams = z.infer<typeof establishmentSearchParamsSchema>;

export const mapBoundsParamsSchema = z.object({
  minLat: z.coerce.number().min(-90).max(90),
  maxLat: z.coerce.number().min(-90).max(90),
  minLon: z.coerce.number().min(-180).max(180),
  maxLon: z.coerce.number().min(-180).max(180),
  rating: z.enum(RATING_KEYS).optional(),
  businessType: z.coerce.number().int().positive().optional(),
  localAuthority: z.string().trim().min(1).max(20).optional(),
});

export type MapBoundsParams = z.infer<typeof mapBoundsParamsSchema>;
