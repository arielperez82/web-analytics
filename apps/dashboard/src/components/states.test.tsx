// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DashboardState } from "@/lib/dashboard-state";
import { reportBySlug } from "@/lib/reports";

import { RankedTable } from "./RankedTable";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const state: DashboardState = { range: { days: 7 }, filters: {} };
const params = { date_from: "2026-11-10", date_to: "2026-11-16", domain: "a.example" };
const report = reportBySlug("locations");
if (report === undefined) throw new Error("no locations report");

const reply = (status: number, body: unknown) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const ok = (rows: readonly object[]) => reply(200, { data: rows });
const failing = reply(500, { error: "warehouse down" });
const spain = [{ location: "ES", sessions: 10, hits: 30, bar_percent: 100 }];

const renderTable = (...responses: readonly (() => Promise<Response>)[]) => {
  const queue = [...responses];
  const fetcher = vi.fn(() => (queue.length > 1 ? queue.shift() : queue[0])?.());
  vi.stubGlobal("fetch", fetcher);
  const props = { report, state, params };
  const view = render(<RankedTable {...props} />);
  return { fetcher, rerender: (next: typeof params) => view.rerender(<RankedTable {...props} params={next} />) };
};

describe("loading, empty and error states", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    renderTable(() => new Promise<Response>(() => undefined));

    expect(await screen.findByRole("status", { name: "Loading" })).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("drops the skeleton once there is data", async () => {
    renderTable(ok(spain));

    await screen.findByText("ES");
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });

  it("says what is missing and what to do when there is nothing to show", async () => {
    renderTable(ok([]));

    expect(await screen.findByText("No data for this range. Try a wider range or fewer filters.")).toBeTruthy();
  });

  it("keeps the last good rows beside the error, which offers Retry", async () => {
    const view = renderTable(ok(spain), failing);
    await screen.findByText("ES");

    view.rerender({ ...params, date_from: "2026-11-01" });

    expect((await screen.findByRole("alert")).textContent).toContain("warehouse down");
    expect(screen.getByText("ES")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("asks again when Retry is pressed and clears the error on success", async () => {
    const view = renderTable(ok(spain), failing, ok([{ location: "FR", sessions: 3, hits: 4, bar_percent: 100 }]));
    await screen.findByText("ES");
    view.rerender({ ...params, date_from: "2026-11-01" });

    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await screen.findByText("FR");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(view.fetcher).toHaveBeenCalledTimes(3);
  });

  it("offers Retry when the very first answer fails", async () => {
    renderTable(failing, ok(spain));

    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText("ES")).toBeTruthy();
  });
});
