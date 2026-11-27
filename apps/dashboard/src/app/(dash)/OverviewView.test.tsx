// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Goal } from "@/lib/goals";
import { installFakeApi, removeFakeApi } from "@/test/fake-api";

import { OverviewView } from "./OverviewView";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: () => undefined }),
  useSearchParams: () => new URLSearchParams("domain=a.example"),
}));

afterEach(() => {
  cleanup();
  removeFakeApi();
});

const goals: readonly Goal[] = [{ name: "Signup", path: "/thanks" }];

describe("OverviewView", () => {
  it("places conversions directly under the chart, before the breakdowns", () => {
    installFakeApi({});
    render(<OverviewView goals={goals} goalErrors={[]} />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent ?? "");
    const conversions = headings.findIndex((text) => text.startsWith("Conversions"));
    const breakdowns = headings.findIndex((text) => text.startsWith("Breakdowns"));

    expect(conversions).toBeGreaterThanOrEqual(0);
    expect(conversions).toBeLessThan(breakdowns);
  });

  it("puts Speed in the bottom row beside Pages and Sources, ahead of the other breakdowns", () => {
    installFakeApi({});
    render(<OverviewView goals={[]} goalErrors={[]} />);

    const panels = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent ?? "");

    expect(panels.slice(panels.indexOf("Pages"), panels.indexOf("Pages") + 4)).toEqual(["Pages", "Sources", "Speed", "Channels"]);
  });

  it("renders one panel per goal when the same path has different denominators, with no duplicate keys", () => {
    installFakeApi({});
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <OverviewView
        goals={[
          { name: "Booked per session", path: "/book" },
          { name: "Booked per visitor", path: "/book", denominator: "visitor" },
          { name: "Booked count", path: "/book", denominator: "none" },
        ]}
        goalErrors={[]}
      />,
    );

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent ?? "")
      .filter((text) => text.includes("/book"));
    expect(titles).toEqual(["Booked per session · /book", "Booked per visitor · /book", "Booked count · /book"]);
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    errors.mockRestore();
  });
});
