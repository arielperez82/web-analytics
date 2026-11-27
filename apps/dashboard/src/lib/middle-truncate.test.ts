import { describe, expect, it } from "vitest";

import { splitForMiddleTruncation } from "./middle-truncate";

describe("splitForMiddleTruncation", () => {
  it("leaves a short value whole", () => {
    expect(splitForMiddleTruncation("/pricing")).toEqual({ head: "/pricing", tail: "" });
  });

  it("keeps the last characters of a long value apart so its end always shows", () => {
    const path = "/docs/guides/getting-started/installation/troubleshooting";

    const { head, tail } = splitForMiddleTruncation(path);

    expect(tail).toBe("/troubleshooting");
    expect(`${head}${tail}`).toBe(path);
    expect(head.length).toBeGreaterThan(0);
  });

  it("splits a value exactly as long as the tail window into nothing to truncate", () => {
    const value = "x".repeat(16);

    expect(splitForMiddleTruncation(value)).toEqual({ head: value, tail: "" });
  });

  it("honours a custom tail length", () => {
    expect(splitForMiddleTruncation("abcdefghij", { tailLength: 3 })).toEqual({ head: "abcdefg", tail: "hij" });
  });
});
