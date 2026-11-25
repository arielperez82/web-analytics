// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PageHeader } from "./PageHeader";

afterEach(cleanup);

describe("PageHeader", () => {
  it("names the page and says what it is showing", () => {
    render(<PageHeader title="Overview" subtitle="Last 7 Days · Europe/Madrid" />);

    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeTruthy();
    expect(screen.getByText("Last 7 Days · Europe/Madrid")).toBeTruthy();
  });

  it("holds the page controls beside the title", () => {
    render(
      <PageHeader title="Overview" subtitle="x">
        <button type="button">Filter</button>
      </PageHeader>,
    );

    expect(screen.getByRole("button", { name: "Filter" })).toBeTruthy();
  });

  it("is the banner of the page", () => {
    render(<PageHeader title="Overview" subtitle="x" />);

    expect(screen.getByRole("banner")).toBeTruthy();
  });
});
