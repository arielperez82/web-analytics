import { describe, expect, it } from "vitest";

import { isValidGoalPath, parseGoals } from "./goals";

describe("isValidGoalPath", () => {
  it.each(["/", "/book/confirmed", "/it's/done", "/café/done", "/a b"])(
    "accepts %s",
    (path) => expect(isValidGoalPath(path)).toBe(true),
  );

  it.each([
    ["no leading slash", "book/confirmed"],
    ["empty", ""],
    ["a percent sign", "/caf%C3%A9/done"],
    ["a query string", "/book?step=2"],
    ["a fragment", "/book#done"],
    ["a full url", "https://example.com/book"],
    ["too long", `/${"a".repeat(200)}`],
  ])("rejects a path with %s", (_label, path) =>
    expect(isValidGoalPath(path)).toBe(false),
  );
});

describe("parseGoals", () => {
  it("returns no goals and no errors when nothing is configured", () => {
    expect(parseGoals(undefined)).toEqual({ goals: [], errors: [] });
    expect(parseGoals("  ")).toEqual({ goals: [], errors: [] });
  });

  it("reads goals from a JSON array", () => {
    const raw = JSON.stringify([
      { name: "Book a session", path: "/book/confirmed" },
      { name: "Signed up", path: "/welcome/done" },
    ]);
    expect(parseGoals(raw)).toEqual({
      goals: [
        { name: "Book a session", path: "/book/confirmed" },
        { name: "Signed up", path: "/welcome/done" },
      ],
      errors: [],
    });
  });

  it("drops an invalid entry, keeps the valid ones and says what was wrong", () => {
    const raw = JSON.stringify([
      { name: "Good", path: "/ok" },
      { name: "Bad path", path: "no-slash" },
      { name: "", path: "/nameless" },
      { path: "/missing-name" },
      "not an object",
    ]);
    const result = parseGoals(raw);
    expect(result.goals).toEqual([{ name: "Good", path: "/ok" }]);
    expect(result.errors).toHaveLength(4);
    expect(result.errors[0]).toContain("Bad path");
  });

  it("reports malformed JSON instead of throwing", () => {
    const result = parseGoals("{not json");
    expect(result.goals).toEqual([]);
    expect(result.errors).toEqual(["DASHBOARD_GOALS is not valid JSON"]);
  });

  it("reports a value that is not an array", () => {
    const result = parseGoals(JSON.stringify({ name: "x", path: "/x" }));
    expect(result.goals).toEqual([]);
    expect(result.errors).toEqual(["DASHBOARD_GOALS must be a JSON array"]);
  });

  it("limits how many goals are shown", () => {
    const raw = JSON.stringify(
      Array.from({ length: 12 }, (_, i) => ({ name: `g${i}`, path: `/g${i}` })),
    );
    const result = parseGoals(raw);
    expect(result.goals).toHaveLength(10);
    expect(result.errors).toEqual(["DASHBOARD_GOALS allows at most 10 goals; the rest were ignored"]);
  });
});
