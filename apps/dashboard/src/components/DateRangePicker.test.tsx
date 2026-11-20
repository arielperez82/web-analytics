// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateRangePicker } from "./DateRangePicker";

afterEach(cleanup);

const renderPicker = (overrides: Partial<Parameters<typeof DateRangePicker>[0]> = {}) =>
  render(
    <DateRangePicker
      range={{ days: 7 }}
      zone="Europe/Madrid"
      onChange={() => undefined}
      onZoneChange={() => undefined}
      {...overrides}
    />,
  );

describe("DateRangePicker", () => {
  it("names the time zone on the button that opens it", () => {
    renderPicker();

    expect(screen.getByRole("button", { name: /Last 7 Days/ }).textContent).toContain("Europe/Madrid");
  });

  it("keeps the time zone inside the calendar, out of sight until it opens", () => {
    renderPicker();
    expect(screen.queryByLabelText("Time zone")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Last 7 Days/ }));

    expect((screen.getByLabelText("Time zone") as HTMLSelectElement).value).toBe("Europe/Madrid");
  });

  it("reports the zone the viewer picks and keeps the calendar open", () => {
    const onZoneChange = vi.fn();
    renderPicker({ onZoneChange });
    fireEvent.click(screen.getByRole("button", { name: /Last 7 Days/ }));

    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "America/New_York" } });

    expect(onZoneChange).toHaveBeenCalledWith("America/New_York");
    expect(screen.getByRole("dialog", { name: "Date range" })).toBeTruthy();
  });

  describe("shortcuts", () => {
    const open = () => fireEvent.click(screen.getByRole("button", { name: /Last 7 Days/ }));

    it("lists them in calendar order", () => {
      renderPicker();
      open();

      const labels = Array.from(screen.getByRole("dialog", { name: "Date range" }).querySelectorAll(".presets button")).map(
        (button) => button.textContent,
      );
      expect(labels).toEqual([
        "Yesterday",
        "Today",
        "Last 7 Days",
        "This Week",
        "Last 30 Days",
        "This Month",
        "Last 90 Days",
        "This Year",
        "Last 12 Months",
      ]);
    });

    it("reports the shortcut the viewer picks and closes", () => {
      const onChange = vi.fn();
      renderPicker({ onChange });
      open();

      fireEvent.click(screen.getByRole("button", { name: "This Week" }));

      expect(onChange).toHaveBeenCalledWith({ preset: "this_week" });
      expect(screen.queryByRole("dialog", { name: "Date range" })).toBeNull();
    });

    it("marks the shortcut in use and names it on the button", () => {
      renderPicker({ range: { preset: "this_month" } });

      expect(screen.getByRole("button", { name: /This Month/ }).textContent).toContain("This Month");
      fireEvent.click(screen.getByRole("button", { name: /This Month/ }));
      expect(screen.getByRole("button", { name: "This Month", pressed: true })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Last 7 Days", pressed: false })).toBeTruthy();
    });
  });
});
