// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import type { DashboardState } from "@/lib/dashboard-state";
import { installFakeApi, removeFakeApi, type ApiRow } from "@/test/fake-api";

import { Kpis } from "./Kpis";

afterEach(() => {
  cleanup();
  removeFakeApi();
});

const state: DashboardState = { range: { days: 7 }, filters: {} };
const params = { date_from: "2026-11-10", date_to: "2026-11-16", domain: "a.example" };

const counts: ApiRow = {
  known_visitors: 120,
  anonymous_visitors: 340,
  legacy_visitors: 5,
  sessions: 410,
  consented_sessions_percent: 41.5,
  previous_known_visitors: 100,
  previous_anonymous_visitors: 350,
  previous_sessions: 380,
  known_visitors_growth_percent: 20,
  anonymous_visitors_growth_percent: -2.86,
  sessions_growth_percent: 7.89,
};
const engagement: ApiRow = {
  pageviews: 1234,
  views_per_session: 3.01,
  bounce_rate_percent: 37.5,
  avg_session_sec: 95,
  previous_pageviews: 1000,
  previous_bounce_rate_percent: 39,
  previous_avg_session_sec: 95,
  pageviews_growth_percent: 23.4,
  bounce_rate_growth_percent: -3.85,
  avg_session_sec_growth_percent: 0,
};
const series: readonly ApiRow[] = [
  { date: "2026-11-10", value: 10, bar_percent: 100 },
  { date: "2026-11-11", value: 90, bar_percent: 25 },
];

const hours: readonly ApiRow[] = [
  { hour: "2026-11-10 09:00:00", value: 7, bar_percent: 100 },
  { hour: "2026-11-10 10:00:00", value: 2, bar_percent: 30 },
];

const renderKpis = (
  overrides: {
    params?: Record<string, string>;
    onChange?: (next: DashboardState) => void;
    series?: readonly ApiRow[];
    state?: DashboardState;
  } = {},
) => {
  const api = installFakeApi({
    visitor_counts: [counts],
    engagement: [engagement],
    daily_series: overrides.series ?? series,
    hourly_series: hours,
  });
  render(<Kpis state={overrides.state ?? state} params={overrides.params ?? params} onChange={overrides.onChange ?? (() => undefined)} />);
  return api;
};

const card = async (label: string): Promise<HTMLElement> => {
  const heading = await screen.findByText(label, { selector: "span" });
  const element = heading.closest<HTMLElement>(".card");
  if (element === null) throw new Error(`no card for ${label}`);
  return element;
};

describe("Kpis", () => {
  it("shows every card exactly as the API computed it", async () => {
    renderKpis();

    const known = within(await card("Known visitors"));
    await waitFor(() => expect(known.getByText("120")).toBeTruthy());
    expect(known.getByText("+20% vs previous period")).toBeTruthy();
    expect(known.getByText("41.5% of sessions from people who accepted tracking")).toBeTruthy();
    expect(within(await card("Anonymous visitors")).getByText("340")).toBeTruthy();
    expect(within(await card("Sessions")).getByText("410")).toBeTruthy();
    expect(within(await card("Sessions")).getByText("+7.89% vs previous period")).toBeTruthy();
    expect(within(await card("Pageviews")).getByText("1,234")).toBeTruthy();
    expect(within(await card("Bounce rate")).getByText("37.5%")).toBeTruthy();
    expect(within(await card("Bounce rate")).getByText("-3.85% vs previous period")).toBeTruthy();
    expect(within(await card("Avg session")).getByText("95s")).toBeTruthy();
    expect(within(await card("Avg session")).getByText("0% vs previous period")).toBeTruthy();
  });

  it("says known visitors are unique and anonymous visitors are not unique across days", async () => {
    renderKpis();

    const known = within(await card("Known visitors"));
    await waitFor(() => expect(known.getByText("Unique people, counted once across the range")).toBeTruthy());
    expect(
      within(await card("Anonymous visitors")).getByText(
        "Counted per visitor day, which ends at each visitor’s own midnight: a returning person counts again each day",
      ),
    ).toBeTruthy();
  });

  it("labels the y axis from the range of the rows and the x axis with the days", async () => {
    renderKpis({
      series: [
        { date: "2026-11-10", value: 40, bar_percent: 100 },
        { date: "2026-11-11", value: 12, bar_percent: 30 },
      ],
    });

    const yAxis = await screen.findByLabelText("Chart y axis");
    expect(Array.from(yAxis.querySelectorAll("span")).map((tick) => tick.textContent)).toEqual(["40", "20", "0"]);
    const xAxis = screen.getByLabelText("Chart x axis");
    expect(Array.from(xAxis.querySelectorAll("span")).map((tick) => tick.textContent)).toEqual(["Nov 10", "Nov 11"]);
  });

  it("does not derive the sessions card from the chart rows", async () => {
    renderKpis();

    await waitFor(async () => expect(within(await card("Sessions")).getByText("410")).toBeTruthy());
    expect(screen.queryByText("100")).toBeNull();
  });

  it("marks distinct counts as approximate and exact counts as plain", async () => {
    renderKpis();

    const note = "Exact for small counts, within 1% for large ones.";
    await waitFor(async () => expect(within(await card("Sessions")).getByTitle(note)).toBeTruthy());
    expect(within(await card("Known visitors")).getByTitle(note)).toBeTruthy();
    expect(within(await card("Anonymous visitors")).getByTitle(note)).toBeTruthy();
    expect(within(await card("Pageviews")).queryByTitle(note)).toBeNull();
    expect(within(await card("Bounce rate")).queryByTitle(note)).toBeNull();
  });

  it("sizes each bar from the percentage the API gives, not from the values", async () => {
    renderKpis();

    const chart = await screen.findByRole("group", { name: "Sessions chart" });
    await waitFor(() => expect(within(chart).getAllByRole("button")).toHaveLength(2));
    const heights = within(chart)
      .getAllByRole("button")
      .map((bar) => (bar.firstElementChild as HTMLElement).style.height);
    expect(heights).toEqual(["100%", "25%"]);
  });

  it("asks the series endpoint for the metric the viewer picks", async () => {
    const api = renderKpis();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Known visitors" }));

    await waitFor(() => expect(api.requestsTo("daily_series").map((query) => query.get("metric"))).toContain("known"));
    expect(api.requestsTo("daily_series")[0]?.get("metric")).toBe("sessions");
  });

  it("sends the range and filters to every endpoint it reads", async () => {
    const api = renderKpis({ params: { ...params, location: "ES" } });

    await screen.findByRole("group", { name: "Sessions chart" });
    await waitFor(() => expect(api.requestsTo("engagement")).toHaveLength(1));
    for (const endpoint of ["visitor_counts", "engagement", "daily_series"]) {
      const query = api.requestsTo(endpoint)[0];
      expect(query?.get("date_from")).toBe("2026-11-10");
      expect(query?.get("location")).toBe("ES");
    }
  });

  it("drills into a day when its bar is clicked", async () => {
    const picked: DashboardState[] = [];
    renderKpis({ onChange: (next) => picked.push(next) });
    const user = userEvent.setup();

    const chart = await screen.findByRole("group", { name: "Sessions chart" });
    await user.click(await within(chart).findByTitle("2026-11-11: 90"));

    expect(picked).toEqual([{ ...state, range: { from: "2026-11-11", to: "2026-11-11" }, grain: "hour" }]);
  });

  it("shows the hours of a single-day range from the hourly series", async () => {
    const api = renderKpis({ params: { ...params, date_to: "2026-11-10" } });

    const chart = await screen.findByRole("group", { name: "Sessions chart" });
    await waitFor(() => expect(within(chart).getAllByRole("button")).toHaveLength(2));
    const heights = within(chart)
      .getAllByRole("button")
      .map((bar) => (bar.firstElementChild as HTMLElement).style.height);
    expect(heights).toEqual(["100%", "30%"]);
    expect(within(chart).getByTitle("2026-11-10 09:00:00: 7")).toBeTruthy();
    expect(api.requestsTo("hourly_series")[0]?.get("metric")).toBe("sessions");
    expect(api.requestsTo("daily_series")).toHaveLength(0);
    expect(await screen.findByText(/per hour/)).toBeTruthy();
  });

  it("asks the hourly series for the UTC instants of the local days, without a zone", async () => {
    const api = renderKpis({
      params: { ...params, date_from: "2026-11-10", date_to: "2026-11-10", tz: "America/New_York" },
    });

    await waitFor(() => expect(api.requestsTo("hourly_series")).toHaveLength(1));
    const query = api.requestsTo("hourly_series")[0];
    expect(query?.get("from_utc")).toBe("2026-11-10 05:00:00");
    expect(query?.get("to_utc")).toBe("2026-11-11 05:00:00");
    expect(query?.has("tz")).toBe(false);
    expect(query?.has("date_from")).toBe(false);
    expect(query?.has("date_to")).toBe(false);
  });

  it("shows the UTC hours it gets on the clock of the zone", async () => {
    renderKpis({
      params: { ...params, date_from: "2026-11-10", date_to: "2026-11-10", tz: "America/New_York" },
    });

    const chart = await screen.findByRole("group", { name: "Sessions chart" });
    await waitFor(() => expect(within(chart).getAllByRole("button")).toHaveLength(2));
    expect(within(chart).getByTitle("2026-11-10 04:00:00: 7")).toBeTruthy();
  });

  it("keeps the zone on the endpoints that cut whole days", async () => {
    const api = renderKpis({ params: { ...params, tz: "America/New_York" } });

    await waitFor(() => expect(api.requestsTo("daily_series")).toHaveLength(1));
    expect(api.requestsTo("daily_series")[0]?.get("tz")).toBe("America/New_York");
    expect(api.requestsTo("visitor_counts")[0]?.get("tz")).toBe("America/New_York");
  });

  it("does not offer a drill-down on the hours of a single day", async () => {
    renderKpis({ params: { ...params, date_to: "2026-11-10" } });

    const chart = await screen.findByRole("group", { name: "Sessions chart" });
    await waitFor(() => expect(within(chart).getAllByRole("button")).toHaveLength(2));
    expect(within(chart).getAllByRole("button").every((bar) => (bar as HTMLButtonElement).disabled)).toBe(true);
  });

  it("asks the hourly series for the metric the viewer picks", async () => {
    const api = renderKpis({ params: { ...params, date_to: "2026-11-10" } });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Pageviews" }));

    await waitFor(() => expect(api.requestsTo("hourly_series").map((query) => query.get("metric"))).toContain("pageviews"));
  });

  it("keeps the metric keys and the granularity as two separate controls", async () => {
    renderKpis();

    const keys = await screen.findByRole("group", { name: "Chart series" });
    expect(within(keys).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Sessions",
      "Known visitors",
      "Anonymous visitors",
      "Pageviews",
    ]);
    const grain = screen.getByRole("group", { name: "Chart granularity" });
    expect(within(grain).getAllByRole("button").map((button) => button.textContent)).toEqual(["Day", "Hour"]);
  });

  it("shows hours for a week when the viewer chooses Hour", async () => {
    const api = renderKpis({ state: { ...state, grain: "hour" } });

    expect(await screen.findByText(/Sessions per hour/)).toBeTruthy();
    await waitFor(() => expect(api.requestsTo("hourly_series")).toHaveLength(1));
    expect(api.requestsTo("daily_series")).toHaveLength(0);
    expect(within(screen.getByRole("group", { name: "Chart granularity" })).getByRole("button", { name: "Hour" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("asks to switch the grain when Hour or Day is clicked", async () => {
    const picked: DashboardState[] = [];
    renderKpis({ onChange: (next) => picked.push(next) });
    const user = userEvent.setup();

    const grain = await screen.findByRole("group", { name: "Chart granularity" });
    await user.click(within(grain).getByRole("button", { name: "Hour" }));

    expect(picked).toEqual([{ ...state, grain: "hour" }]);
  });

  it("offers Day on a single day, where the choice is a single bar", async () => {
    const api = renderKpis({ state: { ...state, grain: "day" }, params: { ...params, date_to: "2026-11-10" } });

    expect(await screen.findByText(/Sessions per day/)).toBeTruthy();
    await waitFor(() => expect(api.requestsTo("daily_series")).toHaveLength(1));
  });

  it("does not offer Hour for a range longer than the API will roll up", async () => {
    renderKpis({ params: { ...params, date_from: "2026-10-18" } });

    const grain = await screen.findByRole("group", { name: "Chart granularity" });
    expect((within(grain).getByRole("button", { name: "Hour" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(grain).getByRole("button", { name: "Day" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the daily series for ranges longer than a day", async () => {
    const api = renderKpis();

    await screen.findByRole("group", { name: "Sessions chart" });
    await waitFor(() => expect(api.requestsTo("daily_series")).toHaveLength(1));
    expect(api.requestsTo("hourly_series")).toHaveLength(0);
  });

  it("says that the bars can add up to more than the card", async () => {
    renderKpis();

    expect(await screen.findByText("Bars are per-day counts and can add up to more than the card.")).toBeTruthy();
  });

  it("says the same of the hours", async () => {
    renderKpis({ params: { ...params, date_to: "2026-11-10" } });

    expect(await screen.findByText("Bars are per-hour counts and can add up to more than the card.")).toBeTruthy();
  });
});
