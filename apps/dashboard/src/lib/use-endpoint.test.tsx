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

describe("useEndpoint when the session has expired", () => {
  it("sends the user to sign in and back to the same url state", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/reports/pages", search: "?date_from=2026-01-01", assign });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

    render(<First from="2026-01-01" />);

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("/login?callbackUrl=%2Freports%2Fpages%3Fdate_from%3D2026-01-01"),
    );
  });

  it("still redirects when the 401 has no readable body", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/speed", search: "?days=7", assign });
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 401,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));

    render(<First from="2026-01-01" />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login?callbackUrl=%2Fspeed%3Fdays%3D7"));
  });

  it("does not redirect for a superseded request that returns 401", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/", search: "", assign });
    let releaseOld: (response: unknown) => void = () => undefined;
    const old = new Promise<unknown>((resolve) => {
      releaseOld = resolve;
    });
    const answers = [
      () => old,
      async () => ({ ok: true, status: 200, json: async () => ({ data: [{ name: "new" }] }) }),
    ];
    vi.stubGlobal("fetch", () => answers.shift()?.());

    const view = render(<First from="old" />);
    view.rerender(<First from="new" />);
    await waitFor(() => expect(screen.getByText("new")).toBeTruthy());

    await act(async () => {
      releaseOld({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) });
      await old;
    });

    expect(assign).not.toHaveBeenCalled();
  });

  it("does not redirect for other failures", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/", search: "", assign });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "Upstream error" }), { status: 502 }));

    render(<First from="2026-01-01" />);

    await waitFor(() => expect(screen.getByText("none")).toBeTruthy());
    expect(assign).not.toHaveBeenCalled();
  });
});
