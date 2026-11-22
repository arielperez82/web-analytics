// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Kbd } from "./Kbd";
import { SegmentedControl } from "./SegmentedControl";

afterEach(cleanup);

describe("shortcut hints", () => {
  it("draws the key for sighted users and keeps it out of the reading order", () => {
    render(<Kbd>D</Kbd>);

    expect(screen.getByText("D").getAttribute("aria-hidden")).toBe("true");
  });

  it("leaves a button's name alone when its option carries a hint", () => {
    render(
      <SegmentedControl
        label="Chart granularity"
        value="day"
        options={[
          { value: "day", label: "Day", hint: "D" },
          { value: "hour", label: "Hour" },
        ]}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Day" })).toBeTruthy();
    expect(screen.getByText("D").getAttribute("aria-hidden")).toBe("true");
  });
});
