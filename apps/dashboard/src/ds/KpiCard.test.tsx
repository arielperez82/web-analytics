// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KpiCard } from "./KpiCard";

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
const keyboard = () => {
  vi.useRealTimers();
  return userEvent.setup();
};
const describedBy = (element: HTMLElement) =>
  (element.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent);

describe("KpiCard", () => {
  it("is named by its label and described by its figure, unmarked, then its change and explanations", () => {
    explained({ tips: ["Unique people", "41.5% accepted tracking"] });

    expect(describedBy(card())).toEqual(["410", "+7.89%", "Unique people41.5% accepted tracking"]);
  });

  it("keeps its explanations hidden until asked for", () => {
    explained();

    expect(tip().hidden).toBe(true);
    expect(tip().textContent).toContain("within 1% for large ones");
  });

  it("explains itself only after the pointer rests on it for 400ms", () => {
    explained();

    fireEvent.mouseEnter(card());
    wait(399);
    expect(tip().hidden).toBe(true);
    wait(1);
    expect(tip().hidden).toBe(false);
  });

  it("does not explain itself when the pointer only passes over it", () => {
    explained();

    fireEvent.mouseEnter(card());
    wait(399);
    fireEvent.mouseLeave(card());
    wait(400);

    expect(tip().hidden).toBe(true);
  });

  it("starts the wait again when the pointer comes back", () => {
    explained();

    fireEvent.mouseEnter(card());
    wait(200);
    fireEvent.mouseEnter(card());
    wait(399);
    expect(tip().hidden).toBe(true);
    wait(1);
    expect(tip().hidden).toBe(false);
  });

  it("hides the explanation when the pointer leaves", () => {
    explained();

    fireEvent.mouseEnter(card());
    wait(400);
    fireEvent.mouseLeave(card());

    expect(tip().hidden).toBe(true);
  });

  it("explains itself straight away to the keyboard, and hides when focus leaves", () => {
    explained();

    fireEvent.focus(card());
    expect(tip().hidden).toBe(false);
    fireEvent.blur(card());
    expect(tip().hidden).toBe(true);
  });

  it("keeps the explanation open for the keyboard when the pointer leaves", () => {
    explained();

    fireEvent.focus(card());
    fireEvent.mouseEnter(card());
    fireEvent.mouseLeave(card());

    expect(tip().hidden).toBe(false);
  });

  it("keeps the explanation open for the pointer when focus leaves", () => {
    explained();

    fireEvent.mouseEnter(card());
    wait(400);
    fireEvent.focus(card());
    fireEvent.blur(card());

    expect(tip().hidden).toBe(false);
  });

  it("waits for the pointer even when a click gives the card focus", () => {
    explained();

    fireEvent.mouseEnter(card());
    fireEvent.pointerDown(card());
    fireEvent.focus(card());
    expect(tip().hidden).toBe(true);
    wait(400);
    expect(tip().hidden).toBe(false);
  });

  it("dismisses the explanation with Escape and leaves focus where it was", async () => {
    const user = keyboard();
    explained();
    await user.tab();

    await user.keyboard("a");
    expect(tip().hidden).toBe(false);
    await user.keyboard("{Escape}");

    expect(tip().hidden).toBe(true);
    expect(document.activeElement).toBe(card());
  });

  it("dismisses an explanation that was still waiting to show", () => {
    explained();

    fireEvent.mouseEnter(card());
    wait(200);
    fireEvent.keyDown(document, { key: "Escape" });
    wait(400);

    expect(tip().hidden).toBe(true);
  });

  it("keeps the explanation inside the card, so the pointer can move onto it", () => {
    explained();

    expect(card().contains(tip())).toBe(true);
  });

  it("has no explanation to show when it was given none", () => {
    explained({ tips: [] });

    fireEvent.focus(card());

    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
    expect(describedBy(card())).toEqual(["410", "+7.89%"]);
  });

  it("can be picked, and says whether it is", () => {
    const onSelect = vi.fn();
    explained({ onSelect, selected: true });

    fireEvent.click(card());

    expect(onSelect).toHaveBeenCalledOnce();
    expect(card().getAttribute("aria-pressed")).toBe("true");
  });

  it("is a named group, not a control, when it cannot be picked", () => {
    explained({ onSelect: undefined, selected: undefined });

    const group = screen.getByRole("group", { name: "Sessions" });

    expect(screen.queryByRole("button")).toBeNull();
    expect(describedBy(group)).toEqual(["Exact for small counts, within 1% for large ones."]);
  });

  it("still explains itself to the keyboard when it cannot be picked", async () => {
    const user = keyboard();
    explained({ onSelect: undefined, selected: undefined });

    await user.tab();

    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Sessions" }));

    expect(tip().hidden).toBe(false);
  });

  it("shows two explanations that happen to read the same", () => {
    explained({ tips: ["Same words", "Same words"] });

    expect(tip().querySelectorAll("small")).toHaveLength(2);
  });
});
