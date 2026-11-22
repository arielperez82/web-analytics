// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { useShortcuts } from "./use-shortcuts";

afterEach(cleanup);

const Harness = ({ keys, pressed }: { readonly keys: readonly string[]; readonly pressed: string[] }) => {
  useShortcuts(Object.fromEntries(keys.map((key) => [key, () => pressed.push(key)])));
  return (
    <div>
      <input aria-label="text" />
      <textarea aria-label="notes" />
      <select aria-label="zone">
        <option>a</option>
      </select>
      <div contentEditable suppressContentEditableWarning aria-label="rich" />
    </div>
  );
};

const setup = (keys: readonly string[] = ["d", "l"]) => {
  const pressed: string[] = [];
  const view = render(<Harness keys={keys} pressed={pressed} />);
  return { ...view, pressed, user: userEvent.setup() };
};

describe("useShortcuts", () => {
  it("runs the action bound to a key, whichever case it is typed in", async () => {
    const { pressed, user } = setup();

    await user.keyboard("d");
    await user.keyboard("{Shift>}L{/Shift}");

    expect(pressed).toEqual(["d", "l"]);
  });

  it("ignores keys nothing is bound to", async () => {
    const { pressed, user } = setup();

    await user.keyboard("x1{Enter}");

    expect(pressed).toEqual([]);
  });

  it.each(["text", "notes", "zone"])("stays out of the way while typing in the %s field", async (name) => {
    const { pressed, user, getByLabelText } = setup();

    await user.click(getByLabelText(name));
    await user.keyboard("d");

    expect(pressed).toEqual([]);
  });

  it("stays out of the way inside editable content", async () => {
    const { pressed, user, getByLabelText } = setup();

    await user.click(getByLabelText("rich"));
    await user.keyboard("d");

    expect(pressed).toEqual([]);
  });

  it.each(["Control", "Meta", "Alt"])("leaves %s combinations to the browser", async (modifier) => {
    const { pressed, user } = setup();

    await user.keyboard(`{${modifier}>}d{/${modifier}}`);

    expect(pressed).toEqual([]);
  });

  it("stops listening when the page that asked for it goes away", async () => {
    const { pressed, user, unmount } = setup();
    unmount();

    await user.keyboard("d");

    expect(pressed).toEqual([]);
  });
});
