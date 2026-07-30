import type { RatingKey } from "./scheme";

export interface ParsedRating {
  ratingValue: string | null;
  ratingKey: RatingKey | null;
}

const NUMERIC_RATINGS = new Set(["0", "1", "2", "3", "4", "5"]);

/**
 * Maps a raw FHRS/FHIS RatingValue string to a normalised, filterable key.
 * FHRS uses "0".."5"; FHIS uses "Pass" / "Improvement Required"; both use
 * "Exempt", "AwaitingInspection", "AwaitingPublication" for non-scored states.
 */
export function parseRating(raw: string | null | undefined): ParsedRating {
  if (raw == null) return { ratingValue: null, ratingKey: null };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ratingValue: null, ratingKey: null };

  if (NUMERIC_RATINGS.has(trimmed)) {
    return { ratingValue: trimmed, ratingKey: trimmed as RatingKey };
  }

  const lower = trimmed.toLowerCase();
  const map: Record<string, RatingKey> = {
    pass: "pass",
    "improvement required": "improvement_required",
    exempt: "exempt",
    awaitinginspection: "awaiting_inspection",
    "awaiting inspection": "awaiting_inspection",
    awaitingpublication: "awaiting_publication",
    "awaiting publication": "awaiting_publication",
  };
  const key = map[lower];
  return { ratingValue: trimmed, ratingKey: key ?? null };
}

const SCORE_MIN = 0;
const SCORE_MAX = 100;

/** FHRS hygiene/structural/confidence scores are small non-negative integers. */
export function parseScore(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || Number.isNaN(value)) return null;
  if (value < SCORE_MIN || value > SCORE_MAX) return null;
  return value;
}
