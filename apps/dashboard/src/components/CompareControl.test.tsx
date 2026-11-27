// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import type { DashboardState } from "@/lib/dashboard-state";

import { CompareControl } from "./CompareControl";

afterEach(cleanup);

const state: DashboardState = { range: { days: 7 }, filters: {} };

const renderControl = ({
  current = state,
  picked = [] as DashboardState[],
}: { current?: DashboardState; picked?: DashboardState[] } = {}) => {
  render(<CompareControl state={current} onChange={(next) => picked.push(next)} />);
  return picked;
};

const labels = () =>
  within(screen.getByRole("group", { name: "Compare to" }))
    .getAllByRole("button")
    .map((button) => button.textContent);

describe("CompareControl", () => {
  it("offers the four named comparisons or nothing, with the previous period picked", () => {
    renderControl();

    expect(labels()).toEqual(["Previous period", "Previous week", "Previous month", "Previous year", "None"]);
    expect(screen.getByRole("button", { name: "Previous period" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("writes the default back out of the state when the previous period is picked", async () => {
    const picked = renderControl({ current: { ...state, compare: "off" } });

    expect(screen.getByRole("button", { name: "None" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.setup().click(screen.getByRole("button", { name: "Previous period" }));

    expect(picked).toStrictEqual([{ ...state, compare: undefined }]);
  });

  it("asks for each named comparison, or for none, when picked", async () => {
    const picked = renderControl();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Previous week" }));
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await user.click(screen.getByRole("button", { name: "Previous year" }));
    await user.click(screen.getByRole("button", { name: "None" }));

    expect(picked).toEqual([
      { ...state, compare: "previous_week" },
      { ...state, compare: "previous_month" },
      { ...state, compare: "previous_year" },
      { ...state, compare: "off" },
    ]);
  });

  it("shows the chosen comparison as pressed", () => {
    renderControl({ current: { ...state, compare: "previous_year" } });

    expect(screen.getByRole("button", { name: "Previous year" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("says Compare beside its choices, so they are not mistaken for ranges", () => {
    renderControl();

    const label = screen.getByText("Compare");
    expect(label.getAttribute("aria-hidden")).toBe("true");
    expect(label.parentElement).toBe(screen.getByRole("group", { name: "Compare to" }).parentElement);
  });

  it("offers nothing to compare all time with", () => {
    renderControl({ current: { ...state, range: { preset: "all_time" } } });

    expect(screen.queryByRole("group", { name: "Compare to" })).toBeNull();
  });
});
