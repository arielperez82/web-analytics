// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SeriesPoint } from "@/lib/use-series";

import { LineChart } from "./LineChart";

afterEach(cleanup);

const points: readonly SeriesPoint[] = [
  { label: "2026-11-10", current: 40, previousLabel: "2026-11-03", previous: 20 },
  { label: "2026-11-11", current: 12, previousLabel: "2026-11-04", previous: null },
  { label: "2026-11-12", current: 30, previousLabel: "2026-11-05", previous: 25 },
];

const renderChart = (overrides: Partial<Parameters<typeof LineChart>[0]> = {}) =>
  render(
    <LineChart
      points={points}
      selected={undefined}
      drillable
      gridlines={[100, 50, 0]}
      onDrill={() => undefined}
      {...overrides}
    />,
  );

const point = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

describe("LineChart", () => {
  it("draws a gridline at each requested height", () => {
    const { container } = renderChart();

    expect(container.querySelectorAll("line[data-gridline]")).toHaveLength(3);
  });

  it("fills the area under the current line", () => {
    const { container } = renderChart();

    expect(container.querySelector("path[data-area]")?.getAttribute("d")).toMatch(/Z$/);
  });

  it("names each point with its value and the comparison by its own date", () => {
    renderChart();

    expect(point("2026-11-10").getAttribute("aria-label")).toBe("2026-11-10: 40 · 2026-11-03: 20");
    expect(point("2026-11-11").getAttribute("aria-label")).toBe("2026-11-11: 12");
  });

  it("shows nothing extra until a point is hovered", () => {
    const { container } = renderChart();

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(container.querySelector("[data-marker]")).toBeNull();
  });

  it("shows a marker and a tooltip with both values while a point is hovered", async () => {
    const user = userEvent.setup();
    const { container } = renderChart();

    await user.hover(point("2026-11-10"));

    const tip = within(screen.getByRole("tooltip"));
    expect(tip.getByText("2026-11-10")).toBeTruthy();
    expect(tip.getByText("40")).toBeTruthy();
    expect(tip.getByText("2026-11-03: 20")).toBeTruthy();
    expect(container.querySelector("[data-marker]")).not.toBeNull();
  });

  it("shows only the current value when there is nothing to compare with", async () => {
    const user = userEvent.setup();
    renderChart();

    await user.hover(point("2026-11-11"));

    expect(within(screen.getByRole("tooltip")).queryByText(/2026-11-04/)).toBeNull();
  });

  it("hides the tooltip when the pointer leaves", async () => {
    const user = userEvent.setup();
    renderChart();

    await user.hover(point("2026-11-10"));
    await user.unhover(point("2026-11-10"));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows the tooltip for the keyboard-focused point and follows the arrow keys", async () => {
    const user = userEvent.setup();
    renderChart();

    await user.tab();
    expect(within(screen.getByRole("tooltip")).getByText("2026-11-10")).toBeTruthy();

    await user.keyboard("{ArrowRight}");
    expect(within(screen.getByRole("tooltip")).getByText("2026-11-11")).toBeTruthy();

    await user.keyboard("{ArrowLeft}");
    expect(within(screen.getByRole("tooltip")).getByText("2026-11-10")).toBeTruthy();
  });

  it("stays on the last point when the arrow keys run out of points", async () => {
    const user = userEvent.setup();
    renderChart();

    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");

    expect(within(screen.getByRole("tooltip")).getByText("2026-11-12")).toBeTruthy();
  });

  it("drills into the clicked point when drilling is on", async () => {
    const onDrill = vi.fn();
    const user = userEvent.setup();
    renderChart({ onDrill });

    await user.click(point("2026-11-11"));

    expect(onDrill).toHaveBeenCalledWith("2026-11-11");
  });

  it("still shows tooltips but never drills when drilling is off", async () => {
    const onDrill = vi.fn();
    const user = userEvent.setup();
    renderChart({ drillable: false, onDrill });

    await user.hover(point("2026-11-10"));
    await user.click(point("2026-11-10"));

    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(point("2026-11-10").getAttribute("aria-disabled")).toBe("true");
    expect(onDrill).not.toHaveBeenCalled();
  });
});
