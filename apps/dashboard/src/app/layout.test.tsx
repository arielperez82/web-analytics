import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { THEME_SCRIPT } from "@/lib/theme-script";

vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "inter" }) }));
vi.mock("./globals.css", () => ({}));

import RootLayout from "./layout";

const render = () =>
  renderToStaticMarkup(
    <RootLayout>
      <p>page</p>
    </RootLayout>,
  );

describe("root layout", () => {
  it("sets the saved theme in the head, before the body is painted", () => {
    const markup = render();
    const head = markup.slice(markup.indexOf("<head>"), markup.indexOf("</head>"));

    expect(head).toContain(`<script>${THEME_SCRIPT}</script>`);
    expect(markup.indexOf("<script>")).toBeLessThan(markup.indexOf("<body"));
  });

  it("still renders the page inside the body", () => {
    expect(render()).toContain("<body><p>page</p></body>");
  });
});
