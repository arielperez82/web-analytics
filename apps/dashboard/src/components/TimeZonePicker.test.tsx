// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimeZonePicker } from "./TimeZonePicker";

afterEach(cleanup);

const optionsOf = (label: string) =>
  Array.from(screen.getByLabelText(label).querySelectorAll("option")).map((option) => ({
    value: option.value,
    text: option.textContent,
  }));

describe("TimeZonePicker", () => {
  it("shows the zone in use", () => {
    render(<TimeZonePicker zone="Europe/Madrid" onChange={() => undefined} />);

    expect((screen.getByLabelText("Time zone") as HTMLSelectElement).value).toBe("Europe/Madrid");
  });

  it("offers UTC, Eastern, Pacific and Central European time, then Other", () => {
    render(<TimeZonePicker zone="Europe/Madrid" onChange={() => undefined} />);

    expect(optionsOf("Time zone")).toEqual([
      { value: "UTC", text: "UTC" },
      { value: "America/New_York", text: "EST (America/New_York)" },
      { value: "America/Los_Angeles", text: "PST (America/Los_Angeles)" },
      { value: "Europe/Madrid", text: "CET (Europe/Madrid)" },
      { value: "other", text: "Other…" },
    ]);
  });

  it("keeps a zone outside those three selectable, under its own name", () => {
    render(<TimeZonePicker zone="Asia/Tokyo" onChange={() => undefined} />);

    expect((screen.getByLabelText("Time zone") as HTMLSelectElement).value).toBe("Asia/Tokyo");
    expect(optionsOf("Time zone").map((option) => option.value)).toEqual([
      "Asia/Tokyo",
      "UTC",
      "America/New_York",
      "America/Los_Angeles",
      "Europe/Madrid",
      "other",
    ]);
  });

  it("reports the zone the viewer picks", () => {
    const onChange = vi.fn();
    render(<TimeZonePicker zone="Europe/Madrid" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "America/Los_Angeles" } });

    expect(onChange).toHaveBeenCalledWith("America/Los_Angeles");
  });

  it("shows the full list only after Other is chosen, and changes nothing yet", () => {
    const onChange = vi.fn();
    render(<TimeZonePicker zone="Europe/Madrid" onChange={onChange} />);
    expect(screen.queryByLabelText("All time zones")).toBeNull();

    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "other" } });

    const all = optionsOf("All time zones").map((option) => option.value);
    expect(all).toContain("Asia/Tokyo");
    expect(all).toContain("UTC");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports a zone picked from the full list and puts the list away", () => {
    const onChange = vi.fn();
    render(<TimeZonePicker zone="Europe/Madrid" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "other" } });

    fireEvent.change(screen.getByLabelText("All time zones"), { target: { value: "Asia/Tokyo" } });

    expect(onChange).toHaveBeenCalledWith("Asia/Tokyo");
    expect(screen.queryByLabelText("All time zones")).toBeNull();
  });
});
