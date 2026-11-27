// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "./SegmentedControl";

afterEach(cleanup);

const options = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "off", label: "None", disabled: true },
] as const;

const renderControl = (overrides: Partial<Parameters<typeof SegmentedControl>[0]> = {}) =>
  render(
    <SegmentedControl
      label="Compare to"
      value="week"
      options={options}
      onChange={() => undefined}
      {...overrides}
    />,
  );

describe("SegmentedControl", () => {
  it("is a named group with exactly the chosen option pressed", () => {
    renderControl();

    const group = screen.getByRole("group", { name: "Compare to" });
    const pressed = (name: string) =>
      screen.getByRole("button", { name }).getAttribute("aria-pressed");

    expect(group).toBeTruthy();
    expect(pressed("This week")).toBe("true");
    expect(pressed("This month")).toBe("false");
  });

  it("reports the value of the option that is clicked", () => {
    const onChange = vi.fn();
    renderControl({ onChange });

    fireEvent.click(screen.getByRole("button", { name: "This month" }));

    expect(onChange).toHaveBeenCalledWith("month");
  });

  it("does not report a disabled option", () => {
    const onChange = vi.fn();
    renderControl({ onChange });

    fireEvent.click(screen.getByRole("button", { name: "None" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
