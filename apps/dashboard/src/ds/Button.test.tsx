// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("is a button that runs its action when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Apply</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("never submits a surrounding form unless asked to", () => {
    render(<Button>Apply</Button>);

    expect(screen.getByRole("button", { name: "Apply" }).getAttribute("type")).toBe("button");
  });

  it("reports a toggled state only when it is a toggle", () => {
    render(
      <>
        <Button pressed>On</Button>
        <Button>Plain</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "On" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Plain" }).hasAttribute("aria-pressed")).toBe(false);
  });

  it("stays out of reach while disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Apply
      </Button>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
