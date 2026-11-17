// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import type { DashboardState } from "@/lib/dashboard-state";
import { type Report,reportBySlug } from "@/lib/reports";
import { type ApiRow,installFakeApi, removeFakeApi } from "@/test/fake-api";

import { RankedTable } from "./RankedTable";

afterEach(() => {
  cleanup();
  removeFakeApi();
});

const state: DashboardState = { range: { days: 7 }, filters: {} };
const params = { date_from: "2026-11-10", date_to: "2026-11-16", domain: "a.example" };

const report = (slug: string): Report => {
  const found = reportBySlug(slug);
  if (found === undefined) throw new Error(`no report ${slug}`);
  return found;
};

const rows: readonly ApiRow[] = [
  { location: "ES", sessions: 10, hits: 30, bar_percent: 100, sessions_growth_percentage: 12.5 },
  { location: "", sessions: 9, hits: 12, bar_percent: 37, sessions_growth_percentage: -4.2 },
  { location: "FR", sessions: 8, hits: 11, bar_percent: 11, sessions_growth_percentage: 0 },
];

type Overrides = Partial<Parameters<typeof RankedTable>[0]>;

const renderTable = (overrides: Overrides = {}, data: readonly ApiRow[] = rows) => {
  const api = installFakeApi({ top_locations: data });
  render(
    <RankedTable
      report={report("locations")}
      state={state}
      params={params}
      onPick={() => undefined}
      {...overrides}
    />,
  );
  return api;
};

const rowOf = async (label: string): Promise<HTMLElement> => {
  const text = await screen.findByText(label);
  const element = text.closest<HTMLElement>("tr");
  if (element === null) throw new Error(`no row for ${label}`);
  return element;
};

describe("RankedTable", () => {
  it("sizes each bar from the percentage the API gives, not from the sessions", async () => {
    renderTable();

    await rowOf("ES");
    const widths = Array.from(document.querySelectorAll<HTMLElement>("span.bar")).map((bar) => bar.style.width);
    expect(widths).toEqual(["100%", "37%", "11%"]);
  });

  it("keeps the order the API ranked the rows in", async () => {
    renderTable();

    await rowOf("ES");
    const labels = Array.from(document.querySelectorAll("td.label")).map((cell) => cell.textContent);
    expect(labels).toEqual(["ES", "(direct)", "FR"]);
  });

  it("shows sessions and hits as the API returned them", async () => {
    renderTable();

    const es = within(await rowOf("ES"));
    expect(es.getByText("10")).toBeTruthy();
    expect(es.getByText("30")).toBeTruthy();
  });

  it("labels an empty value as direct", async () => {
    renderTable();

    expect(await screen.findByText("(direct)")).toBeTruthy();
  });

  it("shows the API's growth with its sign on the detail view", async () => {
    renderTable({ detail: true, report: report("locations") });

    expect(within(await rowOf("ES")).getByText("+12.5%")).toBeTruthy();
    expect(within(await rowOf("(direct)")).getByText("-4.2%")).toBeTruthy();
    expect(within(await rowOf("FR")).getByText("0%")).toBeTruthy();
  });

  it("asks for the previous period only on the detail view", async () => {
    const overview = renderTable();
    await rowOf("ES");
    expect(overview.requestsTo("top_locations")[0]?.get("include_previous_period")).toBeNull();
    cleanup();
    removeFakeApi();

    const detail = renderTable({ detail: true });
    await rowOf("ES");
    expect(detail.requestsTo("top_locations")[0]?.get("include_previous_period")).toBe("true");
  });

  it("shows no growth column for a report that has no previous period", async () => {
    const api = installFakeApi({ channels: [{ channel: "Organic", sessions: 5, hits: 6, bar_percent: 100 }] });
    render(<RankedTable report={report("channels")} state={state} params={params} onPick={() => undefined} detail />);

    await screen.findByText("Organic");
    expect(screen.queryByText("vs previous")).toBeNull();
    expect(api.requestsTo("channels")[0]?.get("include_previous_period")).toBeNull();
  });

  it("sends the limit and the range it was given", async () => {
    const api = renderTable({ limit: 3 });

    await rowOf("ES");
    const query = api.requestsTo("top_locations")[0];
    expect(query?.get("limit")).toBe("3");
    expect(query?.get("date_from")).toBe("2026-11-10");
  });

  it("filters by the row the viewer picks", async () => {
    const picked: (readonly [string, string])[] = [];
    renderTable({ onPick: (key, value) => picked.push([key, value]) });
    const user = userEvent.setup();

    await user.click(await rowOf("FR"));

    expect(picked).toEqual([["location", "FR"]]);
  });

  it("marks the row that is already filtered", async () => {
    renderTable({ state: { ...state, filters: { location: "FR" } } });

    expect((await rowOf("FR")).className).toBe("picked");
    expect((await rowOf("ES")).className).toBe("");
  });

  it("does not offer a filter on a report that cannot filter", async () => {
    const picked: string[] = [];
    installFakeApi({ top_pages: [{ pathname: "/a", sessions: 1, hits: 1, bar_percent: 100 }] });
    render(<RankedTable report={report("pages")} state={state} params={params} onPick={(_, v) => picked.push(v)} />);
    const user = userEvent.setup();

    await user.click(await rowOf("/a"));

    expect(picked).toEqual([]);
  });

  it("offers Show more only when the page is full", async () => {
    const onMore = () => undefined;
    renderTable({ limit: 3, onMore });
    await rowOf("ES");
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();
    cleanup();
    removeFakeApi();

    renderTable({ limit: 4, onMore });
    await rowOf("ES");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Show more" })).toBeNull());
  });

  it("asks for more when Show more is clicked", async () => {
    let asked = 0;
    renderTable({ limit: 3, onMore: () => (asked += 1) });
    const user = userEvent.setup();

    await rowOf("ES");
    await user.click(screen.getByRole("button", { name: "Show more" }));

    expect(asked).toBe(1);
  });
});
