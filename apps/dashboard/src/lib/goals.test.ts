import { describe, expect, it } from "vitest";

import { goalKey, goalLabel, goalQuery, isValidGoalEvent, isValidGoalPath, parseGoals } from "./goals";

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

describe("isValidGoalEvent", () => {
  it.each(["signup_completed", "checkout.done", "cta:clicked", "a-b"])("accepts %s", (event) =>
    expect(isValidGoalEvent(event)).toBe(true),
  );

  it.each([
    ["empty", ""],
    ["a space", "sign up"],
    ["a slash", "/thanks"],
    ["a quote", "it's"],
    ["too long", "a".repeat(101)],
  ])("rejects an event with %s", (_label, event) => expect(isValidGoalEvent(event)).toBe(false));
});

describe("parseGoals with event goals", () => {
  it("reads a goal that names an event instead of a path", () => {
    const raw = JSON.stringify([{ name: "Signed up", event: "signup_completed" }]);
    expect(parseGoals(raw)).toEqual({
      goals: [{ name: "Signed up", event: "signup_completed" }],
      errors: [],
    });
  });

  it("rejects a goal that names both a path and an event, or neither", () => {
    const raw = JSON.stringify([
      { name: "Both", path: "/a", event: "b" },
      { name: "Neither" },
      { name: "Bad event", event: "no spaces allowed" },
    ]);
    const result = parseGoals(raw);
    expect(result.goals).toEqual([]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toContain("Both");
  });
});

describe("parseGoals with event pattern goals", () => {
  it("reads a goal that matches event names with a safe pattern", () => {
    const raw = JSON.stringify([{ name: "Any signup", eventPattern: "signup_.*" }]);
    expect(parseGoals(raw)).toEqual({
      goals: [{ name: "Any signup", eventPattern: "signup_.*" }],
      errors: [],
    });
  });

  it("fails closed on an unsafe pattern and says why", () => {
    const raw = JSON.stringify([
      { name: "Good", event: "ok" },
      { name: "Nested", eventPattern: "(a+)+" },
      { name: "Lookahead", eventPattern: "a(?=b)" },
      { name: "Not text", eventPattern: 5 },
    ]);
    const result = parseGoals(raw);
    expect(result.goals).toEqual([{ name: "Good", event: "ok" }]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toMatch(/Nested.*nested quantifier/);
    expect(result.errors[1]).toMatch(/Lookahead.*\(\?:/);
    expect(result.errors[2]).toContain("Not text");
  });

  it("allows only one of path, event and eventPattern", () => {
    const raw = JSON.stringify([
      { name: "A", event: "a", eventPattern: "a.*" },
      { name: "B", path: "/b", eventPattern: "b.*" },
    ]);
    const result = parseGoals(raw);
    expect(result.goals).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });
});

describe("goal presentation", () => {
  const path = { name: "Booked", path: "/book" };
  const event = { name: "Signed up", event: "signup_completed" };
  const pattern = { name: "Any signup", eventPattern: "signup_.*" };

  it("asks the API with the parameter that matches the goal kind", () => {
    expect(goalQuery(path)).toEqual({ goal_path: "/book" });
    expect(goalQuery(event)).toEqual({ goal_event: "signup_completed" });
    expect(goalQuery(pattern)).toEqual({ goal_event_pattern: "signup_.*" });
  });

  it("labels a goal with what it matches, saying so for a pattern", () => {
    expect(goalLabel(path)).toBe("/book");
    expect(goalLabel(event)).toBe("signup_completed");
    expect(goalLabel(pattern)).toBe("pattern signup_.*");
  });

  it("keys the three kinds apart even when the text is the same", () => {
    const keys = [goalKey(path), goalKey({ name: "x", event: "/book" }), goalKey({ name: "x", eventPattern: "/book" })];
    expect(new Set(keys).size).toBe(3);
  });
});
