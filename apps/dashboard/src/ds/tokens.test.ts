import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");

type Theme = Readonly<Record<string, string>>;

const declarationsOf = (selector: string): Theme => {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`tokens.css has no rule for ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries(
    body
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.startsWith("--"))
      .map((entry) => {
        const [name, ...value] = entry.split(":");
        return [name.slice(2), value.join(":").trim()];
      }),
  );
};

const mediaBlock = (query: string): string => {
  const start = css.indexOf(`@media ${query}`);
  if (start < 0) throw new Error(`tokens.css has no @media ${query}`);
  const open = css.indexOf("{", start);
  const end = [...css.slice(open)].reduce<{ depth: number; at: number }>(
    (acc, char, index) =>
      acc.at >= 0 ? acc : char === "{" ? { ...acc, depth: acc.depth + 1 } : char === "}" ? (acc.depth === 1 ? { depth: 0, at: index } : { ...acc, depth: acc.depth - 1 }) : acc,
    { depth: 0, at: -1 },
  ).at;
  return css.slice(open + 1, open + end);
};

const themes = {
  light: declarationsOf(':root,[data-theme="light"]'),
  dark: declarationsOf('[data-theme="dark"]'),
  contrast: declarationsOf('[data-theme="contrast"]'),
} as const;

const channel = (hex: string, offset: number): number => {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number =>
  0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);

const ratio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TOKENS = [
  "bg", "surface", "surface-hover", "line", "line-control", "text", "text-muted",
  "accent", "accent-soft", "accent-text", "on-accent", "focus-ring", "chart-prev",
  "chart-grid", "tip-bg", "tip-fg", "tip-muted", "good-bg", "good-fg", "warn-bg",
  "warn-fg", "bad-bg", "bad-fg",
] as const;

const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["text", "bg"], ["text", "surface"], ["text", "surface-hover"],
  ["text-muted", "bg"], ["text-muted", "surface"], ["text-muted", "surface-hover"],
  ["accent-text", "accent-soft"], ["on-accent", "accent"],
  ["tip-fg", "tip-bg"], ["tip-muted", "tip-bg"],
  ["good-fg", "good-bg"], ["warn-fg", "warn-bg"], ["bad-fg", "bad-bg"],
];

const GRAPHIC_PAIRS: readonly (readonly [string, string])[] = [
  ["line-control", "surface"], ["line-control", "bg"],
  ["focus-ring", "surface"], ["focus-ring", "bg"],
  ["accent", "surface"], ["chart-prev", "surface"],
];

describe("design tokens", () => {
  it.each(Object.entries(themes))("%s theme defines every token as a hex colour", (_name, theme) => {
    TOKENS.forEach((token) => {
      expect(theme[token], token).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it.each(Object.entries(themes))("%s theme keeps text at 4.5:1 or better", (name, theme) => {
    const floor = name === "contrast" ? 7 : 4.5;
    TEXT_PAIRS.forEach(([fg, bg]) => {
      expect(ratio(theme[fg], theme[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(floor);
    });
  });

  it.each(Object.entries(themes))("%s theme keeps borders, focus ring and chart lines at 3:1", (_name, theme) => {
    GRAPHIC_PAIRS.forEach(([fg, bg]) => {
      expect(ratio(theme[fg], theme[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    });
  });

  it("follows the system dark preference when no theme is chosen", () => {
    expect(declarationsOf(mediaBlock("(prefers-color-scheme:dark)"))).toEqual(themes.dark);
  });

  it("follows the system contrast preference when no theme is chosen, over the dark preference", () => {
    expect(css.indexOf("@media (prefers-contrast:more)")).toBeGreaterThan(
      css.indexOf("@media (prefers-color-scheme:dark)"),
    );
    expect(declarationsOf(mediaBlock("(prefers-contrast:more)"))).toEqual(themes.contrast);
  });

  it.each(["(prefers-color-scheme:dark)", "(prefers-contrast:more)"])(
    "applies the %s fallback only while no theme is chosen, so an explicit light always wins",
    (query) => {
      const block = mediaBlock(query);
      expect(block).toContain(":root:not([data-theme]){");
      expect(block.replace(":root:not([data-theme])", "")).not.toMatch(/(^|[{}])\s*(:root|\[data-theme)/);
    },
  );

  it("outlines every keyboard-focused element with the focus ring", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus-ring\)[^}]*outline-offset:\s*2px/);
  });
});
