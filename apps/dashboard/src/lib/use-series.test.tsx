// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

  it("reports an answer that lacks one metric as an error", async () => {
    answerWith({ grain: "day", series: { sessions: [], known: [], anonymous: [] } });

    render(<Harness />);

    await waitFor(() => expect(screen.getByText("The series answer had no data")).toBeTruthy());
  });

  it("keeps a complete answer", async () => {
    answerWith({ grain: "day", series: { sessions: [], known: [], anonymous: [], pageviews: [] } });

    render(<Harness />);

    await waitFor(() => expect(screen.getByText("has series")).toBeTruthy());
    expect(screen.getByText("no error")).toBeTruthy();
  });
});
