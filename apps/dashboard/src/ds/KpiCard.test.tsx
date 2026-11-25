// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KpiCard, TIP_DELAY_MS } from "./KpiCard";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const explained = (props: Partial<Parameters<typeof KpiCard>[0]> = {}) =>
  render(
    <KpiCard
      label="Sessions"
      value="410"
      delta={<span>+7.89%</span>}
      tips={["Exact for small counts, within 1% for large ones."]}
      onSelect={() => undefined}
      selected={false}
      {...props}
    />,
  );

const card = () => screen.getByRole("button", { name: "Sessions" });
const tip = () => screen.getByRole("tooltip", { hidden: true });
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("KpiCard", () => {
  it("shows the figure as given, with no mark on it", () => {
    explained();

    expect(screen.getByText("410").textContent).toBe("410");
  });

  it("puts the change right beneath the figure", () => {
    explained();

    const value = screen.getByText("410");
    expect(value.nextElementSibling?.textContent).toBe("+7.89%");
  });

  it("keeps its explanations hidden until asked for", () => {
    explained();

    expect(tip().hidden).toBe(true);
    expect(tip().textContent).toContain("within 1% for large ones");
  });

  it("explains itself only after the pointer rests on it for a moment", () => {
    explained();

    fireEvent.mouseEnter(card());
    wait(TIP_DELAY_MS - 1);
    expect(tip().hidden).toBe(true);
    wait(1);
    expect(tip().hidden).toBe(false);
  });

  it("does not explain itself when the pointer only passes over it", () => {
    explained();

    fireEvent.mouseEnter(card());
    wait(TIP_DELAY_MS - 1);
    fireEvent.mouseLeave(card());
    wait(TIP_DELAY_MS);

    expect(tip().hidden).toBe(true);
  });

  it("hides the explanation when the pointer leaves", () => {
    explained();

    fireEvent.mouseEnter(card());
    wait(TIP_DELAY_MS);
    fireEvent.mouseLeave(card());

    expect(tip().hidden).toBe(true);
  });

  it("explains itself straight away to the keyboard, and hides on leaving", () => {
    explained();

    fireEvent.focus(card());
    expect(tip().hidden).toBe(false);
    fireEvent.blur(card());
    expect(tip().hidden).toBe(true);
  });

  it("dismisses the explanation with Escape without moving the pointer or focus", () => {
    explained();

    fireEvent.mouseEnter(card());
    wait(TIP_DELAY_MS);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(tip().hidden).toBe(true);
    expect(card()).toBeTruthy();
  });

  it("lets the pointer move onto the explanation to read it", () => {
    explained();

    fireEvent.mouseEnter(card());
    wait(TIP_DELAY_MS);
    fireEvent.mouseEnter(tip());

    expect(tip().hidden).toBe(false);
  });

  it("is named by its label and described by its figure, change and explanations", () => {
    explained({ tips: ["Unique people", "41.5% accepted tracking"] });

    const ids = (card().getAttribute("aria-describedby") ?? "").split(" ");
    const described = ids.map((id) => document.getElementById(id)?.textContent);

    expect(described).toEqual(["410", "+7.89%", "Unique people41.5% accepted tracking"]);
  });

  it("has no explanation to show when it was given none", () => {
    explained({ tips: [] });

    fireEvent.focus(card());

    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
    expect(card().getAttribute("aria-describedby")).not.toContain("undefined");
  });

  it("can be picked, and says whether it is", () => {
    const onSelect = vi.fn();
    explained({ onSelect, selected: true });

    fireEvent.click(card());

    expect(onSelect).toHaveBeenCalledOnce();
    expect(card().getAttribute("aria-pressed")).toBe("true");
  });

  it("is plain content, not a control, when it cannot be picked", () => {
    explained({ onSelect: undefined, selected: undefined });

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("410")).toBeTruthy();
  });
});
