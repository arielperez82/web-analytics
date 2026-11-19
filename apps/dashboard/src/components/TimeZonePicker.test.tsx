// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimeZonePicker } from "./TimeZonePicker";

afterEach(cleanup);

describe("TimeZonePicker", () => {
  it("shows the zone in use", () => {
    render(<TimeZonePicker zone="Europe/Madrid" onChange={() => undefined} />);

    expect((screen.getByLabelText("Time zone") as HTMLSelectElement).value).toBe("Europe/Madrid");
  });

  it("offers UTC and the zones the browser knows", () => {
    render(<TimeZonePicker zone="UTC" onChange={() => undefined} />);

    const options = Array.from(screen.getByLabelText("Time zone").querySelectorAll("option")).map(
      (option) => option.value,
    );
    expect(options).toContain("UTC");
    expect(options).toContain("America/New_York");
  });

  it("keeps a zone that the browser list lacks selectable", () => {
    render(<TimeZonePicker zone="Etc/Unusual" onChange={() => undefined} />);

    expect((screen.getByLabelText("Time zone") as HTMLSelectElement).value).toBe("Etc/Unusual");
  });

  it("reports the zone the viewer picks", () => {
    const onChange = vi.fn();
    render(<TimeZonePicker zone="UTC" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "Asia/Tokyo" } });

    expect(onChange).toHaveBeenCalledWith("Asia/Tokyo");
  });
});
