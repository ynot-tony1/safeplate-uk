import { describe, expect, it } from "vitest";
import { parseRating, parseScore } from "../rating";

describe("parseRating", () => {
  it.each(["0", "1", "2", "3", "4", "5"])("parses numeric FHRS rating %s", (value) => {
    expect(parseRating(value)).toEqual({ ratingValue: value, ratingKey: value });
  });

  it("parses FHIS Pass", () => {
    expect(parseRating("Pass")).toEqual({ ratingValue: "Pass", ratingKey: "pass" });
  });

  it("parses FHIS Improvement Required", () => {
    expect(parseRating("Improvement Required")).toEqual({
      ratingValue: "Improvement Required",
      ratingKey: "improvement_required",
    });
  });

  it("parses Exempt", () => {
    expect(parseRating("Exempt")).toEqual({ ratingValue: "Exempt", ratingKey: "exempt" });
  });

  it("parses AwaitingInspection (no space, FHRS style)", () => {
    expect(parseRating("AwaitingInspection")).toEqual({
      ratingValue: "AwaitingInspection",
      ratingKey: "awaiting_inspection",
    });
  });

  it("parses 'Awaiting Inspection' (spaced, FHIS style)", () => {
    expect(parseRating("Awaiting Inspection")).toEqual({
      ratingValue: "Awaiting Inspection",
      ratingKey: "awaiting_inspection",
    });
  });

  it("parses FHIS Pass and Eat Safe", () => {
    expect(parseRating("Pass and Eat Safe")).toEqual({
      ratingValue: "Pass and Eat Safe",
      ratingKey: "pass_and_eat_safe",
    });
  });

  it("returns a null key for a genuinely unrecognised value but keeps the raw value", () => {
    expect(parseRating("Some New Rating FSA Invents Later")).toEqual({
      ratingValue: "Some New Rating FSA Invents Later",
      ratingKey: null,
    });
  });

  it("returns nulls for null/empty input", () => {
    expect(parseRating(null)).toEqual({ ratingValue: null, ratingKey: null });
    expect(parseRating("")).toEqual({ ratingValue: null, ratingKey: null });
    expect(parseRating("   ")).toEqual({ ratingValue: null, ratingKey: null });
  });
});

describe("parseScore", () => {
  it("parses a valid score", () => {
    expect(parseScore("10")).toBe(10);
  });

  it("parses zero", () => {
    expect(parseScore("0")).toBe(0);
  });

  it("rejects a negative score", () => {
    expect(parseScore("-5")).toBeNull();
  });

  it("rejects an out-of-range score", () => {
    expect(parseScore("500")).toBeNull();
  });

  it("rejects a non-numeric value", () => {
    expect(parseScore("abc")).toBeNull();
  });

  it("returns null for empty/null input", () => {
    expect(parseScore(null)).toBeNull();
    expect(parseScore("")).toBeNull();
  });
});
