import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");
const layout = readFileSync(fileURLToPath(new URL("./layout.tsx", import.meta.url)), "utf8");

const ruleFor = (selector: string): string => {
  const start = css.indexOf(`${selector}{`);
  if (start < 0) throw new Error(`globals.css has no rule for ${selector}`);
  return css.slice(start, css.indexOf("}", start));
};

describe("the design system foundation", () => {
  it("sets text in Inter, the design system face", () => {
    expect(layout).toContain("Inter");
    expect(ruleFor("body")).toContain("var(--font-sans)");
  });

  it("draws cards and panels with the 14px radius", () => {
    expect(ruleFor(".card")).toContain("border-radius:14px");
    expect(ruleFor(".panel")).toContain("border-radius:14px");
  });

  it("draws controls with the 9px pill radius at the 36px target", () => {
    const controls = ruleFor("select,button,input");
    expect(controls).toContain("border-radius:9px");
    expect(controls).toContain("min-height:36px");
  });

  it("keeps ranked table rows on one line, ellipsizing the middle of a long label", () => {
    expect(ruleFor(".text")).not.toContain("word-break");
    expect(ruleFor(".text")).toContain("white-space:nowrap");
    expect(ruleFor(".text-head")).toContain("text-overflow:ellipsis");
    expect(ruleFor(".text-head")).toContain("overflow:hidden");
    expect(ruleFor(".text-tail")).toContain("flex:none");
    expect(ruleFor("td.label")).toContain("max-width:0");
  });

  it("shows the page title at 24px", () => {
    expect(ruleFor(".page-head h1")).toContain("font-size:24px");
  });
});
