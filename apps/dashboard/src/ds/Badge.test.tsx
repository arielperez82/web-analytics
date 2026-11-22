// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Badge } from "./Badge";

afterEach(cleanup);

describe("Badge", () => {
  it("shows its text with the tone it was given", () => {
    render(<Badge tone="bad">-2.86%</Badge>);

    expect(screen.getByText("-2.86%").getAttribute("data-tone")).toBe("bad");
  });

  it("says the direction in words, so colour is never the only cue", () => {
    render(
      <Badge tone="good" arrow="up" word="Up">
        +20%
      </Badge>,
    );

    expect(screen.getByText("Up")).toBeTruthy();
  });

  it("draws the arrow for sighted users but keeps it out of the reading order", () => {
    render(
      <Badge tone="good" arrow="down" word="Down">
        -3%
      </Badge>,
    );

    expect(screen.getByText("▼").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows no arrow or word when none is given", () => {
    render(<Badge tone="neutral">New</Badge>);

    expect(screen.queryByText("▲")).toBeNull();
    expect(screen.queryByText("▼")).toBeNull();
  });
});
