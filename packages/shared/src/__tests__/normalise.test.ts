import { describe, expect, it } from "vitest";
import { emptyToNull, normaliseName, normalisePostcode, postcodePrefix } from "../normalise";

describe("normaliseName", () => {
  it("lowercases and strips punctuation", () => {
    expect(normaliseName("The Golden Spoon Café!")).toBe("the golden spoon cafe");
  });

  it("collapses repeated whitespace", () => {
    expect(normaliseName("Fish   & Chips")).toBe("fish chips");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normaliseName("  Pizza Place  ")).toBe("pizza place");
  });
});

describe("normalisePostcode", () => {
  it("normalises a compact lowercase postcode", () => {
    expect(normalisePostcode("sw1a1aa")).toBe("SW1A 1AA");
  });

  it("normalises a postcode with irregular spacing", () => {
    expect(normalisePostcode("SW1A   1AA")).toBe("SW1A 1AA");
  });

  it("accepts a short-outward-code postcode", () => {
    expect(normalisePostcode("m11ae")).toBe("M1 1AE");
  });

  it("rejects an invalid postcode", () => {
    expect(normalisePostcode("NOTAPOSTCODE")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(normalisePostcode("")).toBeNull();
  });
});

describe("postcodePrefix", () => {
  it("extracts the outward code", () => {
    expect(postcodePrefix("SW1A 1AA")).toBe("SW1A");
  });
});

describe("emptyToNull", () => {
  it("converts an empty string to null", () => {
    expect(emptyToNull("")).toBeNull();
  });

  it("converts a whitespace-only string to null", () => {
    expect(emptyToNull("   ")).toBeNull();
  });

  it("passes through a non-empty string trimmed", () => {
    expect(emptyToNull("  hello  ")).toBe("hello");
  });

  it("passes through null/undefined as null", () => {
    expect(emptyToNull(null)).toBeNull();
    expect(emptyToNull(undefined)).toBeNull();
  });
});
