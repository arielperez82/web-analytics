// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSeries } from "./use-series";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const Harness = () => {
  const { series, error, loading } = useSeries({ date_from: "2026-11-16" });
  return (
    <>
      <p>{loading ? "loading" : "loaded"}</p>
      <p>{error === undefined ? "no error" : error}</p>
      <p>{series === undefined ? "no series" : "has series"}</p>
    </>
  );
};

const answerWith = (body: unknown) =>
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status: 200 }));

describe("useSeries", () => {
  it("reports an answer without a series as an error rather than a blank chart", async () => {
    answerWith({ grain: "day" });

    render(<Harness />);

    await waitFor(() => expect(screen.getByText("loaded")).toBeTruthy());
    expect(screen.getByText("The series answer had no data")).toBeTruthy();
    expect(screen.getByText("no series")).toBeTruthy();
  });

  it("reports an answer with no metric at all as an error", async () => {
    answerWith({ grain: "day", series: {} });

    render(<Harness />);

    await waitFor(() => expect(screen.getByText("The series answer had no data")).toBeTruthy());
  });

  it("keeps the metrics an answer has when it lacks one", async () => {
    answerWith({ grain: "day", series: { sessions: [], known: [], anonymous: [] } });

    render(<Harness />);

    await waitFor(() => expect(screen.getByText("has series")).toBeTruthy());
    expect(screen.getByText("no error")).toBeTruthy();
  });

  it("keeps a complete answer", async () => {
    answerWith({ grain: "day", series: { sessions: [], known: [], anonymous: [], pageviews: [] } });

    render(<Harness />);

    await waitFor(() => expect(screen.getByText("has series")).toBeTruthy());
    expect(screen.getByText("no error")).toBeTruthy();
  });
});

const point = (label: string) => ({ label, current: 1, previousLabel: null, previous: null });
const every = (label: string) => ({ sessions: [point(label)], known: [], anonymous: [], pageviews: [] });

const First = ({ from }: { readonly from: string }) => {
  const { series } = useSeries({ date_from: from });
  return <p>{series?.sessions?.[0]?.label ?? "none"}</p>;
};

describe("useSeries when a request is overtaken", () => {
  it("ignores a late answer to a request the page has since replaced", async () => {
    let releaseOld: (body: unknown) => void = () => undefined;
    const old = new Promise<unknown>((resolve) => {
      releaseOld = resolve;
    });
    const answers = [
      { ok: true, status: 200, json: () => old },
      { ok: true, status: 200, json: async () => ({ series: every("new") }) },
    ];
    vi.stubGlobal("fetch", async () => answers.shift());

    const view = render(<First from="old" />);
    view.rerender(<First from="new" />);
    await waitFor(() => expect(screen.getByText("new")).toBeTruthy());

    await act(async () => {
      releaseOld({ series: every("old") });
      await old;
    });

    expect(screen.getByText("new")).toBeTruthy();
  });
});

describe("useSeries when the session has expired", () => {
  it("sends the user to sign in and back to the same url state", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/", search: "?date_from=2026-11-16&compare=previous_period", assign });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

    render(<Harness />);

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("/login?callbackUrl=%2F%3Fdate_from%3D2026-11-16%26compare%3Dprevious_period"),
    );
  });

  it("still redirects when the 401 has no readable body", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/", search: "?days=7", assign });
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 401,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));

    render(<Harness />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login?callbackUrl=%2F%3Fdays%3D7"));
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
      async () => ({ ok: true, status: 200, json: async () => ({ series: every("new") }) }),
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
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "boom" }), { status: 502 }));

    render(<Harness />);

    await waitFor(() => expect(screen.getByText("boom")).toBeTruthy());
    expect(assign).not.toHaveBeenCalled();
  });
});
