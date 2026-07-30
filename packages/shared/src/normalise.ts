/**
 * Lowercases and strips punctuation/extra whitespace so business-name
 * prefix search matches regardless of casing or minor formatting differences.
 */
export function normaliseName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/i;

/** Normalises a raw postcode to uppercase with a single separating space. */
export function normalisePostcode(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (compact.length < 5 || compact.length > 8) return null;
  const withSpace = `${compact.slice(0, -3)} ${compact.slice(-3)}`;
  if (!UK_POSTCODE_RE.test(withSpace)) return null;
  return withSpace;
}

/** Outward code (e.g. "SW1A" from "SW1A 1AA") used for prefix search. */
export function postcodePrefix(normalisedPostcode: string): string {
  return normalisedPostcode.split(" ")[0] ?? normalisedPostcode;
}

/** Normalises empty/whitespace-only strings to null, per ingestion spec. */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
