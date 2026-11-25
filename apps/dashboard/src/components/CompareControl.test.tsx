// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import type { DashboardState } from "@/lib/dashboard-state";
import type { QueryParams } from "@/lib/use-dashboard-state";

import { CompareControl } from "./CompareControl";

afterEach(cleanup);

const state: DashboardState = { range: { days: 7 }, filters: {} };
const week: QueryParams = { date_from: "2026-11-10", date_to: "2026-11-16" };
const day: QueryParams = { date_from: "2026-11-10", date_to: "2026-11-10" };
const last24: QueryParams = { date_from: "2026-11-09", date_to: "2026-11-10", from_at: "2026-11-09T16:00:00Z" };

const renderControl = ({
  current = state,
  params = week,
  picked = [] as DashboardState[],
}: { current?: DashboardState; params?: QueryParams; picked?: DashboardState[] } = {}) => {
  render(<CompareControl state={current} params={params} onChange={(next) => picked.push(next)} />);
  return picked;
};

const labels = () =>
  within(screen.getByRole("group", { name: "Compare to" }))
    .getAllByRole("button")
    .map((button) => button.textContent);

describe("CompareControl", () => {
  it("offers the previous period or nothing for a week, with the previous period picked", () => {
    renderControl();

    expect(labels()).toEqual(["Previous period", "None"]);
    expect(screen.getByRole("button", { name: "Previous period" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("also offers the same day last week on a single day", () => {
    renderControl({ params: day });

    expect(labels()).toEqual(["Previous period", "Same day last week", "None"]);
  });

  it("offers the same hours last week for the last 24 hours", () => {
    renderControl({ params: last24 });

    expect(labels()).toEqual(["Previous period", "Same hours last week", "None"]);
  });

  it("writes the default back out of the state when the previous period is picked", async () => {
    const picked = renderControl({ current: { ...state, compare: "off" } });

    expect(screen.getByRole("button", { name: "None" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.setup().click(screen.getByRole("button", { name: "Previous period" }));

    expect(picked).toStrictEqual([{ ...state, compare: undefined }]);
  });

  it("asks to switch the comparison off, or to last week, when those are picked", async () => {
    const picked = renderControl({ params: day });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "None" }));
    await user.click(screen.getByRole("button", { name: "Same day last week" }));

    expect(picked).toEqual([
      { ...state, compare: "off" },
      { ...state, compare: "last_week" },
    ]);
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
