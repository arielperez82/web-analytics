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

    expect(screen.getByRole("button", { name: /Last 7 days/ }).textContent).toContain("Europe/Madrid");
  });

  it("keeps the time zone inside the calendar, out of sight until it opens", () => {
    renderPicker();
    expect(screen.queryByLabelText("Time zone")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Last 7 days/ }));

    expect((screen.getByLabelText("Time zone") as HTMLSelectElement).value).toBe("Europe/Madrid");
  });

  it("reports the zone the viewer picks and keeps the calendar open", () => {
    const onZoneChange = vi.fn();
    renderPicker({ onZoneChange });
    fireEvent.click(screen.getByRole("button", { name: /Last 7 days/ }));

    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "America/New_York" } });

    expect(onZoneChange).toHaveBeenCalledWith("America/New_York");
    expect(screen.getByRole("dialog", { name: "Date range" })).toBeTruthy();
  });
});
