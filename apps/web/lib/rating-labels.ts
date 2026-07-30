import type { RatingKey } from "@safeplate/shared";

/**
 * Human-readable labels and severity bucket for each ratingKey. Used
 * everywhere a rating is displayed so we never show a color swatch alone —
 * every rating badge/chart segment pairs a color with this text.
 */
export const RATING_LABELS: Record<RatingKey, string> = {
  "5": "5 — Very Good",
  "4": "4 — Good",
  "3": "3 — Generally Satisfactory",
  "2": "2 — Improvement Necessary",
  "1": "1 — Major Improvement Necessary",
  "0": "0 — Urgent Improvement Necessary",
  pass: "Pass",
  improvement_required: "Improvement Required",
  awaiting_inspection: "Awaiting Inspection",
  awaiting_publication: "Awaiting Publication",
  exempt: "Exempt",
};

export type RatingSeverity = "good" | "warning" | "serious" | "critical" | "neutral";

/** Maps a ratingKey to a status severity bucket, for icon + color pairing. */
export function ratingSeverity(key: string | null | undefined): RatingSeverity {
  switch (key) {
    case "5":
    case "4":
    case "pass":
      return "good";
    case "3":
      return "warning";
    case "2":
    case "1":
      return "serious";
    case "0":
    case "improvement_required":
      return "critical";
    default:
      return "neutral";
  }
}

export function ratingLabel(key: string | null | undefined): string {
  if (!key) return "Not yet rated";
  return RATING_LABELS[key as RatingKey] ?? key;
}
