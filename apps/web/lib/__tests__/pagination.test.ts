import { describe, expect, it } from "vitest";
import { buildKeysetWhere, buildNullBucketWhere, decodeCursor, encodeCursor } from "../pagination";

describe("cursor encode/decode", () => {
  it("round-trips a cursor with a non-null sort value", () => {
    const cursor = { v: "5", id: "12345" };
    const encoded = encodeCursor(cursor);
    expect(typeof encoded).toBe("string");
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it("round-trips a null-bucket cursor", () => {
    const cursor = { v: null, id: "999" };
    const encoded = encodeCursor(cursor);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it("produces a URL-safe string with no padding characters", () => {
    const encoded = encodeCursor({ v: "some business name", id: "abc-123" });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("returns null for garbage input", () => {
    expect(decodeCursor("not-valid-base64-json!!!")).toBeNull();
  });

  it("returns null when the decoded payload lacks an id", () => {
    const bogus = Buffer.from(JSON.stringify({ v: "x" }), "utf8").toString("base64url");
    expect(decodeCursor(bogus)).toBeNull();
  });

  it("returns null for non-JSON base64 payloads", () => {
    const bogus = Buffer.from("just some text", "utf8").toString("base64url");
    expect(decodeCursor(bogus)).toBeNull();
  });
});

describe("buildKeysetWhere", () => {
  it("returns undefined when there is no cursor (first page)", () => {
    expect(buildKeysetWhere("ratingKey", "asc", null)).toBeUndefined();
  });

  it("returns undefined when the cursor is in the null bucket", () => {
    expect(buildKeysetWhere("ratingKey", "asc", { v: null, id: "1" })).toBeUndefined();
  });

  it("builds an ascending OR/AND predicate", () => {
    const where = buildKeysetWhere("ratingKey", "asc", { v: "3", id: "abc" });
    expect(where).toEqual({
      OR: [{ ratingKey: { gt: "3" } }, { AND: [{ ratingKey: "3" }, { fhrsId: { gt: "abc" } }] }],
    });
  });

  it("builds a descending predicate using lt instead of gt", () => {
    const where = buildKeysetWhere("businessName", "desc", { v: "Zebra Cafe", id: "xyz" });
    expect(where).toEqual({
      OR: [
        { businessName: { lt: "Zebra Cafe" } },
        { AND: [{ businessName: "Zebra Cafe" }, { fhrsId: { lt: "xyz" } }] },
      ],
    });
  });
});

describe("buildNullBucketWhere", () => {
  it("returns undefined when there is no cursor", () => {
    expect(buildNullBucketWhere("asc", null)).toBeUndefined();
  });

  it("returns undefined when the cursor is not in the null bucket", () => {
    expect(buildNullBucketWhere("asc", { v: "5", id: "1" })).toBeUndefined();
  });

  it("builds an fhrsId-only predicate once inside the null bucket", () => {
    expect(buildNullBucketWhere("asc", { v: null, id: "42" })).toEqual({
      fhrsId: { gt: "42" },
    });
    expect(buildNullBucketWhere("desc", { v: null, id: "42" })).toEqual({
      fhrsId: { lt: "42" },
    });
  });
});
