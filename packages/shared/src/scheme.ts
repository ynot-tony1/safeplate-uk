export const SCHEME_TYPES = ["FHRS", "FHIS"] as const;
export type SchemeTypeValue = (typeof SCHEME_TYPES)[number];

/**
 * FHRS ratings are numeric 0-5. FHIS (Scotland) uses "Pass" / "Improvement Required".
 * ratingKey normalises both into a small set of sortable/filterable buckets.
 */
export const RATING_KEYS = [
  "5",
  "4",
  "3",
  "2",
  "1",
  "0",
  "pass",
  "pass_and_eat_safe",
  "improvement_required",
  "awaiting_inspection",
  "awaiting_publication",
  "exempt",
] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

export const SORTABLE_FIELDS = ["business_name", "rating", "rating_date"] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
