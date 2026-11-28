import { describe, expect, it } from "vitest";

import { THEME_CHOICES, parseThemeChoice } from "./theme";

describe("theme choices", () => {
  it.each([...THEME_CHOICES])("accepts %s", (choice) => {
    expect(parseThemeChoice(choice)).toBe(choice);
  });

  it.each([null, undefined, "", "Dark", "sepia", "1"])("falls back to system for %s", (raw) => {
    expect(parseThemeChoice(raw)).toBe("system");
  });
});
