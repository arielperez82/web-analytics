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

const comparison = { compare: "previous" } as const;

const rows: readonly ApiRow[] = [
  { location: "ES", sessions: 10, hits: 30, bar_percent: 100, previous_sessions: 8, previous_bar_percent: 80, sessions_change: 2, sessions_growth_percentage: 25, status: "" },
  { location: "", sessions: 9, hits: 12, bar_percent: 37, previous_sessions: 10, previous_bar_percent: 100, sessions_change: -1, sessions_growth_percentage: -10, status: "" },
  { location: "FR", sessions: 8, hits: 11, bar_percent: 11, previous_sessions: 0, previous_bar_percent: 0, sessions_change: 8, sessions_growth_percentage: 100, status: "new" },
  { location: "DE", sessions: 0, hits: 0, bar_percent: 0, previous_sessions: 3, previous_bar_percent: 30, sessions_change: -3, sessions_growth_percentage: -100, status: "gone" },
];

type Overrides = Partial<Parameters<typeof RankedTable>[0]>;

const renderTable = (overrides: Overrides = {}, data: readonly ApiRow[] = rows) => {
  const api = installFakeApi({ top_locations: data });
  render(
    <RankedTable
      report={report("locations")}
      state={state}
      params={params}
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
    expect(widths).toEqual(["100%", "37%", "11%", "0%"]);
  });

  it("keeps the order the API ranked the rows in", async () => {
    renderTable();

    await rowOf("ES");
    const labels = Array.from(document.querySelectorAll("td.label")).map((cell) => cell.textContent);
    expect(labels).toEqual(["ES", "(direct)", "FR", "DE"]);
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

  it("shows no comparison, on the overview or the detail view, when compare is off", async () => {
    const overview = renderTable();
    await rowOf("ES");
    expect(overview.requestsTo("top_locations")[0]?.get("include_previous_period")).toBeNull();
    cleanup();
    removeFakeApi();

    const detail = renderTable({ detail: true });
    await rowOf("ES");
    expect(detail.requestsTo("top_locations")[0]?.get("include_previous_period")).toBeNull();
    expect(screen.queryByText("vs previous")).toBeNull();
  });

  it("asks for the comparison it is given, on the overview too", async () => {
    const api = renderTable({ comparison });

    await rowOf("ES");
    const query = api.requestsTo("top_locations")[0];
    expect(query?.get("include_previous_period")).toBe("true");
    expect(query?.get("compare")).toBe("previous");
    expect(query?.has("compare_from")).toBe(false);
    expect(query?.has("compare_from_at")).toBe(false);
  });

  it("names the same period last week by its choice, never by dates", async () => {
    const api = renderTable({ comparison: { compare: "last_week" } });

    await rowOf("ES");
    const query = api.requestsTo("top_locations")[0];
    expect(query?.get("compare")).toBe("last_week");
    expect(query?.has("compare_to")).toBe(false);
  });

  it("compares channels like every other breakdown", async () => {
    const api = installFakeApi({ channels: [{ channel: "Organic", sessions: 5, hits: 6, bar_percent: 100 }] });
    render(<RankedTable report={report("channels")} state={state} params={params} comparison={comparison} />);

    await screen.findByText("Organic");
    expect(api.requestsTo("channels")[0]?.get("include_previous_period")).toBe("true");
  });

  it("shows each row's change as the API computed it, in the KPI style", async () => {
    renderTable({ comparison });

    expect(within(await rowOf("ES")).getByText("+2 (+25%)")).toBeTruthy();
    expect(within(await rowOf("(direct)")).getByText("-1 (-10%)")).toBeTruthy();
  });

  it("says New for a row that only the current period has", async () => {
    renderTable({ comparison });

    expect(within(await rowOf("FR")).getByText("New")).toBeTruthy();
  });

  it("lists a gone row last, with what it had", async () => {
    renderTable({ comparison });

    const gone = within(await rowOf("DE"));
    expect(gone.getByText("Gone (was 3)")).toBeTruthy();
    const labels = Array.from(document.querySelectorAll("td.label")).map((cell) => cell.textContent);
    expect(labels.at(-1)).toContain("DE");
  });

  it("draws the previous period as a ghost bar the screen reader skips, and says its value in words", async () => {
    renderTable({ comparison });

    const es = await rowOf("ES");
    const ghost = es.querySelector<HTMLElement>("span.bar.ghost");
    expect(ghost?.style.width).toBe("80%");
    expect(ghost?.getAttribute("aria-hidden")).toBe("true");
    expect(within(es).getByText("Previous period: 8 sessions")).toBeTruthy();
  });

  it("names the row before it says what the previous period had", async () => {
    renderTable({ comparison });

    const cell = (await rowOf("ES")).querySelector("td.label");
    expect(cell?.textContent).toBe("ESPrevious period: 8 sessions");
  });

  it("draws no ghost bar without a comparison", async () => {
    renderTable();

    await rowOf("ES");
    expect(document.querySelector("span.bar.ghost")).toBeNull();
  });

  it("sends the limit and the range it was given", async () => {
    const api = renderTable({ limit: 3 });

    await rowOf("ES");
    const query = api.requestsTo("top_locations")[0];
    expect(query?.get("limit")).toBe("3");
    expect(query?.get("date_from")).toBe("2026-11-10");
  });

  it("leaves filtering to the filter menu: no hint, rows are not clickable", async () => {
    renderTable({ state: { ...state, filters: { location: "FR" } } });

    const row = await rowOf("FR");
    expect(screen.queryByText("Click a row to filter")).toBeNull();
    expect(row.style.cursor).toBe("");
    expect(row.className).toBe("");
  });

  it("offers Show more only when the page is full", async () => {
    const onMore = () => undefined;
    renderTable({ limit: 3, onMore });
    await rowOf("ES");
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();
    cleanup();
    removeFakeApi();

    renderTable({ limit: 5, onMore });
    await rowOf("ES");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Show more" })).toBeNull());
  });

  it("offers See all at the bottom of an overview widget, keeping the filters", async () => {
    renderTable({ state: { ...state, filters: { device: "mobile-ios" } } });

    await rowOf("ES");
    const link = screen.getByRole("link", { name: "See all" });
    expect(link.getAttribute("href")).toContain("/reports/locations");
    expect(link.getAttribute("href")).toContain("device=mobile-ios");
  });

  it("titles the widget with its plain name", async () => {
    renderTable();

    expect(await screen.findByRole("heading", { name: "Locations" })).toBeTruthy();
  });

  it("leaves See all off the detail view", async () => {
    renderTable({ detail: true });

    await rowOf("ES");
    expect(screen.queryByRole("link", { name: "See all" })).toBeNull();
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
