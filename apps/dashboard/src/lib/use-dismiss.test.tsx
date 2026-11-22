// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useDismiss } from "./use-dismiss";

afterEach(cleanup);

const Harness = ({ open, calls }: { readonly open: boolean; readonly calls: string[] }) => {
  const box = useRef<HTMLDivElement>(null);
  useDismiss({
    open,
    within: box,
    onEscape: () => calls.push("escape"),
    onOutside: () => calls.push("outside"),
  });
  return (
    <>
      <div ref={box}>
        <button>inside</button>
      </div>
      <button>outside</button>
    </>
  );
};

const setup = (open = true) => {
  const calls: string[] = [];
  const view = render(<Harness open={open} calls={calls} />);
  return { ...view, calls, user: userEvent.setup() };
};

describe("useDismiss", () => {
  it("reports Escape and a press outside while open", async () => {
    const { calls, user } = setup();

    await user.keyboard("{Escape}");
    await user.click(screen.getByText("outside"));

    expect(calls).toEqual(["escape", "outside"]);
  });

  it("ignores every other key and a press inside", async () => {
    const { calls, user } = setup();

    await user.keyboard("a{Enter}");
    await user.click(screen.getByText("inside"));

    expect(calls).toEqual([]);
  });

  it("ignores an Escape something else already handled", () => {
    const { calls } = setup();

    fireEvent.keyDown(screen.getByText("inside"), { key: "Escape", defaultPrevented: true });
    const handled = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    handled.preventDefault();
    document.dispatchEvent(handled);

    expect(calls).toEqual(["escape"]);
  });

  it("listens to nothing while closed", async () => {
    const { calls, user } = setup(false);

    await user.keyboard("{Escape}");
    await user.click(screen.getByText("outside"));

    expect(calls).toEqual([]);
  });

  it("stops listening when it goes away", async () => {
    const { calls, user, unmount } = setup();
    unmount();

    await user.keyboard("{Escape}");

    expect(calls).toEqual([]);
  });
});
