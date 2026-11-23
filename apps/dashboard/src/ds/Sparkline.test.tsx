// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Sparkline } from "./Sparkline";

afterEach(cleanup);

const point = (label: string, current: number) => ({ label, current, previousLabel: null, previous: null });

describe("Sparkline", () => {
  it("draws the supplied trend as one line, lowest value at the bottom", () => {
    const { container } = render(<Sparkline points={[point("a", 0), point("b", 10), point("c", 5)]} />);

    const d = container.querySelector("path.spark-line")?.getAttribute("d") ?? "";
    const coordinates = [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]);

    expect(coordinates.map(([, y]) => y)).toEqual([100, 0, 50]);
    expect(coordinates.map(([x]) => x)).toEqual([...coordinates.map(([x]) => x)].sort((a, b) => a - b));
  });

  it("joins the points evenly with one move and straight lines", () => {
    const { container } = render(<Sparkline points={[point("a", 0), point("b", 10), point("c", 5)]} />);

    const d = container.querySelector("path.spark-line")?.getAttribute("d") ?? "";

    expect(d.match(/[A-Z]/g)).toEqual(["M", "L", "L"]);
    const xs = [...d.matchAll(/[ML]([\d.]+),/g)].map(([, x]) => Number(x));
    [16.67, 50, 83.33].forEach((expected, index) => expect(xs[index]).toBeCloseTo(expected, 1));
  });

  it("scales from zero, so a steady busy series sits near the top, not across the height", () => {
    const { container } = render(<Sparkline points={[point("a", 100), point("b", 101), point("c", 100)]} />);

    const d = container.querySelector("path.spark-line")?.getAttribute("d") ?? "";
    const heights = [...d.matchAll(/,([\d.]+)/g)].map(([, y]) => Number(y));

    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(5);
  });

  it("lies flat along the bottom when every value is zero", () => {
    const { container } = render(<Sparkline points={[point("a", 0), point("b", 0)]} />);

    const d = container.querySelector("path.spark-line")?.getAttribute("d") ?? "";

    expect([...d.matchAll(/,([\d.]+)/g)].map(([, y]) => Number(y))).toEqual([100, 100]);
  });

  it("is decoration beside the figure, so it stays out of the accessibility tree", () => {
    const { container } = render(<Sparkline points={[point("a", 1), point("b", 2)]} />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each([
    ["no trend", []],
    ["a single point, which is not a trend", [point("a", 3)]],
  ])("draws nothing for %s", (_name, points) => {
    const { container } = render(<Sparkline points={points} />);

    expect(container.querySelector("svg")).toBeNull();
  });
});
