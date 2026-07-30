import { describe, expect, it } from "vitest";
import { RATING_KEYS } from "@safeplate/shared";
import { ratingLabel, ratingSeverity } from "../rating-labels";

const NON_SEVERITY_KEYS = new Set(["awaiting_inspection", "awaiting_publication", "exempt"]);

describe("ratingSeverity", () => {
  it("maps every scored ratingKey to a real severity bucket, and unscored states to neutral", () => {
    for (const key of RATING_KEYS) {
      const severity = ratingSeverity(key);
      if (NON_SEVERITY_KEYS.has(key)) {
        expect(severity).toBe("neutral");
      } else {
        expect(severity).not.toBe("neutral");
      }
    }
  });

  it("treats null/undefined/unknown as neutral", () => {
    expect(ratingSeverity(null)).toBe("neutral");
    expect(ratingSeverity(undefined)).toBe("neutral");
    expect(ratingSeverity("bogus")).toBe("neutral");
  });

  it("buckets FHRS numeric ratings by severity, worst to best", () => {
    expect(ratingSeverity("5")).toBe("good");
    expect(ratingSeverity("4")).toBe("good");
    expect(ratingSeverity("3")).toBe("warning");
    expect(ratingSeverity("2")).toBe("serious");
    expect(ratingSeverity("1")).toBe("serious");
    expect(ratingSeverity("0")).toBe("critical");
  });

  it("buckets FHIS ratings", () => {
    expect(ratingSeverity("pass")).toBe("good");
    expect(ratingSeverity("improvement_required")).toBe("critical");
  });
});

describe("ratingLabel", () => {
  it("never relies on color alone — always returns non-empty text", () => {
    for (const key of RATING_KEYS) {
      expect(ratingLabel(key).length).toBeGreaterThan(0);
    }
  });

  it("returns a clear placeholder for a missing rating", () => {
    expect(ratingLabel(null)).toBe("Not yet rated");
    expect(ratingLabel(undefined)).toBe("Not yet rated");
  });
});
