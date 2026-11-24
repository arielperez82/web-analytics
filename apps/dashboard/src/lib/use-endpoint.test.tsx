// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useEndpoint } from "./use-endpoint";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const First = ({ from }: { readonly from: string }) => {
  const { data } = useEndpoint<{ name: string }>("pages", { date_from: from });
  return <p>{data?.[0]?.name ?? "none"}</p>;
};

describe("useEndpoint when a request is overtaken", () => {
  it("ignores a late answer to a request the page has since replaced", async () => {
    let releaseOld: (body: unknown) => void = () => undefined;
    const old = new Promise<unknown>((resolve) => {
      releaseOld = resolve;
    });
    const answers = [
      { ok: true, status: 200, json: () => old },
      { ok: true, status: 200, json: async () => ({ data: [{ name: "new" }] }) },
    ];
    vi.stubGlobal("fetch", async () => answers.shift());

    const view = render(<First from="old" />);
    view.rerender(<First from="new" />);
    await waitFor(() => expect(screen.getByText("new")).toBeTruthy());

    await act(async () => {
      releaseOld({ data: [{ name: "old" }] });
      await old;
    });

    expect(screen.getByText("new")).toBeTruthy();
  });
});
