import { describe, expect, it } from "vitest";

import { THEME_CHOICES, THEME_STORAGE_KEY, parseThemeChoice } from "./theme";

describe("theme choices", () => {
  it("offers system first, then the three themes the tokens define", () => {
    expect(THEME_CHOICES).toEqual(["system", "light", "dark", "contrast"]);
  });

  it.each([...THEME_CHOICES])("accepts %s", (choice) => {
    expect(parseThemeChoice(choice)).toBe(choice);
  });

  it.each([null, undefined, "", "Dark", "sepia", "1"])("falls back to system for %s", (raw) => {
    expect(parseThemeChoice(raw)).toBe("system");
  });

  it("stores the choice under one key", () => {
    expect(THEME_STORAGE_KEY).toBe("theme");
  });
});
