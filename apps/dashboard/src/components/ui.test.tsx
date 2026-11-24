// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Panel } from "./ui";

afterEach(cleanup);

describe("Panel", () => {
  it("is an ordinary section until it is asked to take focus", () => {
    render(<Panel title="Pages">rows</Panel>);

    expect(screen.queryByRole("region")).toBeNull();
    expect(document.querySelector("section")?.hasAttribute("tabindex")).toBe(false);
  });

  it("becomes a named region that can take focus when asked", () => {
    render(
      <Panel title="Sessions per day" focusable>
        chart
      </Panel>,
    );

    const region = screen.getByRole("region", { name: "Sessions per day" });
    region.focus();
    expect(document.activeElement).toBe(region);
  });
});
