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
  it("draws a gridline at each requested height, measured up from the bottom", () => {
    const { container } = renderChart({ gridlines: [80, 25] });

    const lines = Array.from(container.querySelectorAll("line[data-gridline]"));
    expect(lines.map((line) => line.getAttribute("y1"))).toEqual(["20", "75"]);
  });

  it("joins neighbouring points and leaves a gap where the comparison is missing", () => {
    const { container } = renderChart();

    expect(container.querySelector("[data-line=current]")?.getAttribute("d")).toMatch(/^M\S+ L\S+ L\S+$/);
    expect(container.querySelector("[data-line=previous]")?.getAttribute("d")).toMatch(/^M(\S+) L\1 M(\S+) L\2$/);
  });

  it("draws a lone point as a dot and gives it no area", () => {
    const { container } = renderChart({ points: points.slice(0, 1) });

    expect(container.querySelector("[data-line=current]")?.getAttribute("d")).toMatch(/^M(\S+) L\1$/);
    expect(container.querySelector("path[data-area]")).toBeNull();
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

  it("dismisses the tooltip on Escape without moving focus, and brings it back on the next move", async () => {
    const user = userEvent.setup();
    renderChart();

    await user.tab();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(document.activeElement).toBe(point("2026-11-10"));

    await user.keyboard("{ArrowRight}");
    expect(within(screen.getByRole("tooltip")).getByText("2026-11-11")).toBeTruthy();
  });

  it("dismisses a hover tooltip on Escape until the pointer moves to another point", async () => {
    const user = userEvent.setup();
    renderChart();

    await user.hover(point("2026-11-11"));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("tooltip")).toBeNull();

    await user.hover(point("2026-11-12"));
    expect(within(screen.getByRole("tooltip")).getByText("2026-11-12")).toBeTruthy();
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

  it("keeps the tooltip inside the chart at the edges and centred in between", async () => {
    const user = userEvent.setup();
    renderChart();
    const placement = async (name: string) => {
      await user.hover(point(name));
      const tip = screen.getByRole("tooltip");
      await user.unhover(point(name));
      return { edge: tip.getAttribute("data-edge"), left: parseFloat(tip.style.left) };
    };

    const [first, middle, last] = [await placement("2026-11-10"), await placement("2026-11-11"), await placement("2026-11-12")];

    expect([first.edge, middle.edge, last.edge]).toEqual(["start", "middle", "end"]);
    expect(first.left).toBeCloseTo(16.67, 1);
    expect(middle.left).toBeCloseTo(50, 1);
    expect(last.left).toBeCloseTo(83.33, 1);
  });

  it("keeps showing the focused point when the pointer passes over another and leaves", async () => {
    const user = userEvent.setup();
    renderChart();

    await user.tab();
    await user.hover(point("2026-11-12"));
    expect(within(screen.getByRole("tooltip")).getByText("2026-11-12")).toBeTruthy();
    await user.unhover(point("2026-11-12"));

    expect(within(screen.getByRole("tooltip")).getByText("2026-11-10")).toBeTruthy();
  });

  it("hides the tooltip when focus leaves", async () => {
    const user = userEvent.setup();
    renderChart();

    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("drops the tooltip when the hovered point is no longer in the data", async () => {
    const user = userEvent.setup();
    const { rerender } = renderChart();
    await user.hover(point("2026-11-12"));

    rerender(
      <LineChart points={points.slice(0, 1)} selected={undefined} drillable gridlines={[]} onDrill={() => undefined} />,
    );

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("stays on the first point when the left arrow has nowhere to go", async () => {
    const user = userEvent.setup();
    renderChart();

    await user.tab();
    await user.keyboard("{ArrowLeft}");

    expect(within(screen.getByRole("tooltip")).getByText("2026-11-10")).toBeTruthy();
  });

  it("marks points as not disabled when drilling is on", () => {
    renderChart();

    expect(point("2026-11-10").getAttribute("aria-disabled")).toBe("false");
  });

  it("does not carry the tooltip over to different data of the same length", async () => {
    const user = userEvent.setup();
    const { rerender } = renderChart();
    await user.hover(point("2026-11-12"));

    rerender(
      <LineChart
        points={points.map((p) => ({ ...p, label: `${p.label}-b` }))}
        selected={undefined}
        drillable
        gridlines={[]}
        onDrill={() => undefined}
      />,
    );

    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
