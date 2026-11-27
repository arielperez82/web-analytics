import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { THEME_SCRIPT } from "@/lib/theme-script";

vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "inter" }) }));
vi.mock("./globals.css", () => ({}));

import RootLayout from "./layout";

const markup = renderToStaticMarkup(
  <RootLayout>
    <p>page</p>
  </RootLayout>,
);

describe("root layout", () => {
  it("sets the saved theme in the head, before the body is painted", () => {
    const head = markup.slice(markup.indexOf("<head>"), markup.indexOf("</head>"));

    expect(head).toContain(`<script>${THEME_SCRIPT}</script>`);
    expect(markup.indexOf("<script>")).toBeLessThan(markup.indexOf("<body"));
  });

  it("tolerates the theme attribute the script adds before React hydrates", () => {
    const source = readFileSync(fileURLToPath(new URL("./layout.tsx", import.meta.url)), "utf8");

    expect(source).toContain("suppressHydrationWarning");
  });
});
