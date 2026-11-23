// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sparkline } from "@/ds/Sparkline";
import type { DashboardState } from "@/lib/dashboard-state";
import { type ApiRow, type FakeApi,installFakeApi, removeFakeApi } from "@/test/fake-api";

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

const days: readonly ApiRow[] = [
  { label: "2026-11-10", current: 40, previousLabel: "2026-11-03", previous: 20 },
  { label: "2026-11-11", current: 12, previousLabel: "2026-11-04", previous: null },
];

const hours: readonly ApiRow[] = [
  { label: "2026-11-10 09:00:00", current: 7, previousLabel: "2026-11-09 09:00:00", previous: 3 },
  { label: "2026-11-10 10:00:00", current: 2, previousLabel: "2026-11-09 10:00:00", previous: 5 },
];

const renderKpis = (
  overrides: {
    params?: Record<string, string>;
    comparison?: { compare_from: string; compare_to: string; compare_from_at?: string };
    onChange?: (next: DashboardState) => void;
    points?: readonly ApiRow[];
    state?: DashboardState;
  } = {},
) => {
  const api = installFakeApi({
    visitor_counts: [counts],
    engagement: [engagement],
    series: (query) => (query.get("grain") === "hour" ? hours : (overrides.points ?? days)),
  });
  render(
    <Kpis
      state={overrides.state ?? state}
      params={overrides.params ?? params}
      comparison={overrides.comparison}
      onChange={overrides.onChange ?? (() => undefined)}
    />,
  );
  return api;
};

const card = async (label: string): Promise<HTMLElement> => {
  const heading = await screen.findByText(label, { selector: "span" });
  const element = heading.closest<HTMLElement>(".card");
  if (element === null) throw new Error(`no card for ${label}`);
  return element;
};

const sessionsSeries = (api: FakeApi) =>
  api.requestsTo("series").filter((query) => query.get("metric") === "sessions");

const failOnce = (endpoint: string, only: (query: URLSearchParams) => boolean = () => true) => {
  const real = globalThis.fetch;
  const seen: boolean[] = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    const name = /\/api\/(?:endpoints\/)?([^?]+)/.exec(input)?.[1] ?? "";
    const target = name === endpoint && only(new URLSearchParams(input.split("?")[1] ?? ""));
    const first = target && seen.length === 0;
    if (target) seen.push(true);
    return first
      ? Promise.resolve(new Response(JSON.stringify({ error: "warehouse down" }), { status: 500 }))
      : real(input, init);
  });
};

const comparison = { compare_from: "2026-11-03", compare_to: "2026-11-09" };
const line = async (which: "current" | "previous") => {
  const chart = await screen.findByRole("group", { name: "Sessions chart" });
  await waitFor(() => expect(chart.querySelector(`path[data-line="${which}"]`)).not.toBeNull());
  return chart.querySelector(`path[data-line="${which}"]`) as SVGPathElement;
};

describe("Kpis", () => {
  it("shows every card exactly as the API computed it", async () => {
    renderKpis();

    const known = within(await card("Known visitors"));
    await waitFor(() => expect(known.getByText("120")).toBeTruthy());
    expect(known.getByText("+20%")).toBeTruthy();
    expect(known.getByText("Up")).toBeTruthy();
    expect(known.getByText("vs previous period")).toBeTruthy();
    expect(known.getByText("41.5% of sessions from people who accepted tracking")).toBeTruthy();
    expect(within(await card("Anonymous visitors")).getByText("340")).toBeTruthy();
    expect(within(await card("Sessions")).getByText("410")).toBeTruthy();
    expect(within(await card("Sessions")).getByText("+7.89%")).toBeTruthy();
    expect(within(await card("Pageviews")).getByText("1,234")).toBeTruthy();
    expect(within(await card("Bounce rate")).getByText("37.5%")).toBeTruthy();
    expect(within(await card("Bounce rate")).getByText("-3.85%")).toBeTruthy();
    expect(within(await card("Avg session")).getByText("95s")).toBeTruthy();
    expect(within(await card("Avg session")).getByText("0%")).toBeTruthy();
  });

  it("marks each change with a direction word and a tone that depends on which way is better", async () => {
    renderKpis();
    const change = async (name: string, text: string) => within(await card(name)).getByText(text);

    expect((await change("Known visitors", "+20%")).getAttribute("data-tone")).toBe("good");
    expect((await change("Anonymous visitors", "-2.86%")).getAttribute("data-tone")).toBe("bad");
    expect((await change("Bounce rate", "-3.85%")).getAttribute("data-tone")).toBe("good");
    expect((await change("Sessions", "+7.89%")).getAttribute("data-tone")).toBe("good");
    expect((await change("Pageviews", "+23.4%")).getAttribute("data-tone")).toBe("good");
    expect((await change("Avg session", "0%")).getAttribute("data-tone")).toBe("neutral");
    expect(within(await card("Bounce rate")).getByText("Down")).toBeTruthy();
    expect(within(await card("Avg session")).getByText("No change")).toBeTruthy();
  });

  it("names each metric card by its label alone and groups them as the key figures", async () => {
    renderKpis();

    expect(await screen.findByRole("group", { name: "Key figures" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sessions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pageviews" })).toBeTruthy();
  });

  it("describes a card by its figures, change and notes, and only those it has", async () => {
    renderKpis();
    const describedBy = async (name: string) => {
      const ids = (await screen.findByRole("button", { name })).getAttribute("aria-describedby") ?? "";
      return ids.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" | ");
    };

    const known = await describedBy("Known visitors");
    const sessions = await describedBy("Sessions");

    expect(known).toContain("+20%");
    expect(known).toContain("Unique people, counted once across the range");
    expect(known).toContain("41.5% of sessions from people who accepted tracking");
    expect(sessions).toContain("+7.89%");
    expect(sessions).not.toContain("Unique people");
    expect(sessions.split(" | ")).toHaveLength(2);
  });

  it("lets the keyboard pick a card", async () => {
    renderKpis();
    const user = userEvent.setup();

    (await screen.findByRole("button", { name: "Pageviews" })).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "Pageviews" }).getAttribute("aria-pressed")).toBe("true");
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

  it("labels the y axis from the highest value of either line and the x axis with the days", async () => {
    renderKpis({ comparison });

    const yAxis = await screen.findByLabelText("Chart y axis");
    await waitFor(() =>
      expect(Array.from(yAxis.querySelectorAll("span")).map((tick) => tick.textContent)).toEqual(["40", "20", "0"]),
    );
    const xAxis = screen.getByLabelText("Chart x axis");
    expect(Array.from(xAxis.querySelectorAll("span")).map((tick) => tick.textContent)).toEqual(["Nov 10", "Nov 11"]);
  });

  it("draws the current period as a solid line and the previous one as a dashed line on one scale", async () => {
    renderKpis({ comparison });

    expect((await line("current")).getAttribute("d")).toBe("M25,0 L75,70");
    const previous = await line("previous");
    expect(previous.getAttribute("d")).toBe("M25,50 L25,50");
    expect(previous.classList.contains("previous")).toBe(true);
  });

  it("asks the series route for the metric the viewer picks", async () => {
    const api = renderKpis({ comparison });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Known visitors/ }));

    await waitFor(() =>
      expect(
        api.requestsTo("series").some((query) => query.get("metric") === "known" && query.has("compare_from")),
      ).toBe(true),
    );
  });

  it("sends the range, the comparison and the filters to the series route as plain values", async () => {
    const api = renderKpis({ params: { ...params, location: "ES", tz: "Europe/Madrid" }, comparison });

    await waitFor(() => expect(sessionsSeries(api)).toHaveLength(2));
    const query = sessionsSeries(api).at(-1);
    expect(query?.get("date_from")).toBe("2026-11-10");
    expect(query?.get("compare_from")).toBe("2026-11-03");
    expect(query?.get("compare_to")).toBe("2026-11-09");
    expect(query?.get("location")).toBe("ES");
    expect(query?.get("tz")).toBe("Europe/Madrid");
    expect(query?.get("grain")).toBe("day");
  });

  it("asks for no comparison when there is none", async () => {
    const api = renderKpis();

    await waitFor(() => expect(sessionsSeries(api)).toHaveLength(2));
    expect(sessionsSeries(api).at(-1)?.has("compare_from")).toBe(false);
    expect(within(screen.getByLabelText("Chart legend")).queryByText(/Previous period/)).toBeNull();
  });

  it("drills into a day when its point is clicked", async () => {
    const picked: DashboardState[] = [];
    renderKpis({ comparison, onChange: (next) => picked.push(next) });
    const user = userEvent.setup();

    const chart = await screen.findByRole("group", { name: "Sessions chart" });
    await user.click(await within(chart).findByLabelText("2026-11-11: 12"));

    expect(picked).toEqual([{ ...state, range: { from: "2026-11-11", to: "2026-11-11" }, grain: "hour" }]);
  });

  it("shows both values in one tooltip, the comparison by its own date", async () => {
    renderKpis({ comparison });

    const chart = await screen.findByRole("group", { name: "Sessions chart" });
    expect(await within(chart).findByLabelText("2026-11-10: 40 · 2026-11-03: 20")).toBeTruthy();
  });

  it("shows the hours of a single-day range from the hourly series", async () => {
    const api = renderKpis({ params: { ...params, date_to: "2026-11-10" }, comparison });

    const chart = await screen.findByRole("group", { name: "Sessions chart" });
    await waitFor(() => expect(within(chart).getAllByRole("button")).toHaveLength(2));
    expect(within(chart).getByLabelText("2026-11-10 09:00:00: 7 · 2026-11-09 09:00:00: 3")).toBeTruthy();
    expect(sessionsSeries(api).at(-1)?.get("grain")).toBe("hour");
    expect(await screen.findByText(/per hour/)).toBeTruthy();
  });

  it("does not offer a drill-down on the hours of a single day", async () => {
    renderKpis({ params: { ...params, date_to: "2026-11-10" } });

    const chart = await screen.findByRole("group", { name: "Sessions chart" });
    await waitFor(() => expect(within(chart).getAllByRole("button")).toHaveLength(2));
    expect(within(chart).getAllByRole("button").every((bar) => bar.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("steps down to four-hour buckets when the viewer asks for hours over a month", async () => {
    const api = renderKpis({
      params: { ...params, date_from: "2026-10-18", date_to: "2026-11-16" },
      state: { ...state, grain: "hour" },
    });

    await waitFor(() => expect(sessionsSeries(api)).toHaveLength(2));
    expect(await screen.findByText(/per 4 hours/)).toBeTruthy();
  });

  it("lets the four countable cards pick the chart metric instead of separate tabs", async () => {
    renderKpis();

    await screen.findByRole("group", { name: "Chart granularity" });
    expect(screen.queryByRole("group", { name: "Chart series" })).toBeNull();
    const picks = screen
      .getAllByRole("button", { name: /^(Known visitors|Anonymous visitors|Sessions|Pageviews)/ })
      .map((button) => button.querySelector("span")?.textContent);
    expect(picks).toEqual(["Known visitors", "Anonymous visitors", "Sessions", "Pageviews"]);
    expect(screen.queryByRole("button", { name: /^Bounce rate/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Avg session/ })).toBeNull();
  });

  it.each(["Known visitors", "Anonymous visitors", "Sessions", "Pageviews"])(
    "marks only the %s card when the chart shows it",
    async (name) => {
      renderKpis();
      const user = userEvent.setup();
      const cards = ["Known visitors", "Anonymous visitors", "Sessions", "Pageviews"];

      await user.click(await screen.findByRole("button", { name: new RegExp(`^${name}`) }));

      expect(
        cards.map((card) => screen.getByRole("button", { name: new RegExp(`^${card}`) }).getAttribute("aria-pressed")),
      ).toEqual(cards.map((card) => String(card === name)));
    },
  );

  it("asks to switch the grain when Hour or Day is clicked", async () => {
    const picked: DashboardState[] = [];
    renderKpis({ onChange: (next) => picked.push(next) });
    const user = userEvent.setup();

    const grain = await screen.findByRole("group", { name: "Chart granularity" });
    await user.click(within(grain).getByRole("button", { name: "Hour" }));

    expect(picked).toEqual([{ ...state, grain: "hour" }]);
  });

  it("does not offer Hour for a range too long even for four-hour buckets", async () => {
    renderKpis({ params: { ...params, date_from: "2026-08-18" } });

    const grain = await screen.findByRole("group", { name: "Chart granularity" });
    expect((within(grain).getByRole("button", { name: "Hour" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(grain).getByRole("button", { name: "Day" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("names the two ranges in a legend", async () => {
    renderKpis({ comparison });

    expect(await screen.findByText("This period · 2026-11-10 – 2026-11-16")).toBeTruthy();
    expect(screen.getByText("Previous period · 2026-11-03 – 2026-11-09")).toBeTruthy();
  });

  it("says that the lines can add up to more than the card", async () => {
    renderKpis();

    const note = await screen.findByText("Lines are per-day counts and can add up to more than the card.");
    expect(note.className).toBe("footnote");
  });

  describe("the comparison control", () => {
    it("offers the previous period or nothing for a week", async () => {
      renderKpis({ comparison });

      const group = await screen.findByRole("group", { name: "Compare to" });
      expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual([
        "Previous period",
        "None",
      ]);
      expect(within(group).getByRole("button", { name: "Previous period" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("also offers the same day last week on a single day", async () => {
      renderKpis({ params: { ...params, date_to: "2026-11-10" }, comparison });

      const group = await screen.findByRole("group", { name: "Compare to" });
      expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual([
        "Previous period",
        "Same day last week",
        "None",
      ]);
    });

    it("writes the choice into the state, and the default back out of it", async () => {
      const picked: DashboardState[] = [];
      renderKpis({
        comparison,
        state: { ...state, compare: "off" },
        onChange: (next) => picked.push(next),
      });
      const user = userEvent.setup();

      const group = await screen.findByRole("group", { name: "Compare to" });
      expect(within(group).getByRole("button", { name: "None" }).getAttribute("aria-pressed")).toBe("true");
      await user.click(within(group).getByRole("button", { name: "Previous period" }));

      expect(picked).toEqual([state]);
    });

    it("asks to switch the comparison off, or to last week, when those are picked", async () => {
      const picked: DashboardState[] = [];
      renderKpis({
        params: { ...params, date_to: "2026-11-10" },
        comparison,
        onChange: (next) => picked.push(next),
      });
      const user = userEvent.setup();

      const group = await screen.findByRole("group", { name: "Compare to" });
      await user.click(within(group).getByRole("button", { name: "None" }));
      await user.click(within(group).getByRole("button", { name: "Same day last week" }));

      expect(picked).toEqual([
        { ...state, compare: "off" },
        { ...state, compare: "last_week" },
      ]);
    });

    it("offers nothing to compare all time with", async () => {
      renderKpis({ state: { ...state, range: { preset: "all_time" } } });

      await screen.findByRole("group", { name: "Chart granularity" });
      expect(screen.queryByRole("group", { name: "Compare to" })).toBeNull();
    });
  });

  describe("the last 24 hours", () => {
    const last24 = { date_from: "2026-11-09", date_to: "2026-11-10", from_at: "2026-11-09T16:00:00Z" };
    const last24Comparison = { compare_from: "2026-11-08", compare_to: "2026-11-09", compare_from_at: "2026-11-08T16:00:00Z" };
    const range = { ...state, range: { preset: "last_24_hours" } } as DashboardState;

    it("sends the exact start and the start of the comparison to the series route, by the hour", async () => {
      const api = renderKpis({ params: { ...params, ...last24 }, comparison: last24Comparison, state: range });

      await waitFor(() => expect(sessionsSeries(api)).toHaveLength(2));
      const query = sessionsSeries(api).at(-1);
      expect(query?.get("from_at")).toBe("2026-11-09T16:00:00Z");
      expect(query?.get("compare_from_at")).toBe("2026-11-08T16:00:00Z");
      expect(query?.get("grain")).toBe("hour");
    });

    it("cannot be shown by the day", async () => {
      renderKpis({ params: { ...params, ...last24 }, comparison: last24Comparison, state: range });

      const grain = await screen.findByRole("group", { name: "Chart granularity" });
      expect((within(grain).getByRole("button", { name: "Day" }) as HTMLButtonElement).disabled).toBe(true);
      expect(within(grain).getByRole("button", { name: "Hour" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("is named in the legend by its length, not by days", async () => {
      renderKpis({ params: { ...params, ...last24 }, comparison: last24Comparison, state: range });

      expect(await screen.findByText("This period · Last 24 hours")).toBeTruthy();
      expect(screen.getByText("Previous period · the 24 hours before")).toBeTruthy();
    });

    it("offers the same hours last week", async () => {
      renderKpis({ params: { ...params, ...last24 }, comparison: last24Comparison, state: range });

      const group = await screen.findByRole("group", { name: "Compare to" });
      expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual([
        "Previous period",
        "Same hours last week",
        "None",
      ]);
    });
  });
  describe("when the API fails", () => {
    it("says so beside the chart, keeps the cards, and Retry brings the series back", async () => {
      installFakeApi({ visitor_counts: [counts], engagement: [engagement], series: days });
      failOnce("series", (query) => query.has("compare_from"));
      render(<Kpis state={state} params={params} comparison={comparison} onChange={() => undefined} />);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("warehouse down");
      expect(screen.getByRole("group", { name: "Key figures" })).toBeTruthy();
      expect(screen.queryByText(/No data for this range/)).toBeNull();
      await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));

      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
      expect(await screen.findByRole("group", { name: "Sessions chart" })).toBeTruthy();
      expect(document.querySelector(".line.current")).not.toBeNull();
    });

    it("retries only the figures that failed", async () => {
      const api = installFakeApi({ visitor_counts: [counts], engagement: [engagement], series: days });
      failOnce("visitor_counts");
      render(<Kpis state={state} params={params} onChange={() => undefined} />);

      await userEvent.click(await within(await screen.findByRole("alert")).findByRole("button", { name: "Retry" }));

      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
      expect(api.requestsTo("engagement")).toHaveLength(1);
    });

    it("flags failing key figures instead of showing zeros quietly", async () => {
      installFakeApi({ visitor_counts: [counts], engagement: [engagement], series: days });
      failOnce("visitor_counts");
      render(<Kpis state={state} params={params} onChange={() => undefined} />);

      expect((await screen.findByRole("alert")).textContent).toContain("warehouse down");
    });
  });
  describe("trend sparklines", () => {
    const TRENDS = {
      known: [1, 9, 3],
      anonymous: [8, 2, 6],
      sessions: [4, 4, 10],
      pageviews: [9, 1, 1],
    } as const;
    const rowsOf = (values: readonly number[]) =>
      values.map((current, index) => ({ label: `2026-11-1${String(index)}`, current, previousLabel: null, previous: null }));
    const pathOf = (values: readonly number[]) => {
      const { container } = render(<Sparkline points={rowsOf(values)} />);
      const d = container.querySelector("path")?.getAttribute("d");
      cleanup();
      return d;
    };
    const metricOf = (query: URLSearchParams): keyof typeof TRENDS => query.get("metric") as keyof typeof TRENDS;
    const trendRequests = (api: FakeApi) => api.requestsTo("series").filter((query) => !query.has("compare_from"));
    const renderWith = (
      series: (query: URLSearchParams) => readonly ApiRow[],
      props: { params?: Record<string, string>; comparison?: typeof comparison } = {},
    ) => {
      const api = installFakeApi({ visitor_counts: [counts], engagement: [engagement], series });
      const view = render(
        <Kpis state={state} params={props.params ?? params} comparison={props.comparison} onChange={() => undefined} />,
      );
      return { api, ...view };
    };
    const sparkOf = (element: HTMLElement) => element.querySelector("path.spark-line")?.getAttribute("d");

    it.each([
      ["Known visitors", "known"],
      ["Anonymous visitors", "anonymous"],
      ["Sessions", "sessions"],
      ["Pageviews", "pageviews"],
    ] as const)("draws the %s card from that metric's own trend, not the chart's series", async (label, metric) => {
      const expected = pathOf(TRENDS[metric]);
      renderWith((query) => (query.has("compare_from") ? rowsOf([2, 2, 2]) : rowsOf(TRENDS[metricOf(query)])), { comparison });

      const element = await card(label);
      await waitFor(() => expect(sparkOf(element)).toBe(expected));
    });

    it("asks for each trend over the page's own range, filters and grain", async () => {
      const filtered = { ...params, country: "ES" };
      const { api } = renderWith(() => rowsOf([1, 2, 3]), { params: filtered, comparison });

      await waitFor(() => expect(trendRequests(api)).toHaveLength(4));
      expect(trendRequests(api).map(metricOf).sort()).toEqual(["anonymous", "known", "pageviews", "sessions"]);
      trendRequests(api).forEach((query) => {
        expect(Object.fromEntries(query)).toMatchObject({ ...filtered, grain: "day" });
      });
    });

    it("asks for hourly trends over an exact window", async () => {
      const last24 = { ...params, from_at: "2026-11-09T16:00:00Z" };
      const { api } = renderWith(() => rowsOf([1, 2, 3]), {
        params: last24,
        comparison: { compare_from: "2026-11-08", compare_to: "2026-11-09" },
      });

      await waitFor(() => expect(trendRequests(api)).toHaveLength(4));
      trendRequests(api).forEach((query) => {
        expect(Object.fromEntries(query)).toMatchObject({ from_at: "2026-11-09T16:00:00Z", grain: "hour" });
      });
    });

    it("hides the sparkline when the API supplies no trend", async () => {
      renderWith(() => []);

      await screen.findByText(/No data for this range/);
      await waitFor(() => expect(document.querySelectorAll("svg.spark")).toHaveLength(0));
      expect((await card("Sessions")).querySelector("svg.spark")).toBeNull();
    });

    it("draws none for the cards that have no trend metric", async () => {
      renderWith(() => rowsOf([1, 2, 3]));

      await waitFor(() => expect(document.querySelectorAll("svg.spark")).toHaveLength(4));
      expect((await card("Bounce rate")).querySelector("svg.spark")).toBeNull();
      expect((await card("Avg session")).querySelector("svg.spark")).toBeNull();
    });

    it("drops a trend that could not be refreshed rather than show the old range's line", async () => {
      const { rerender } = renderWith(() => rowsOf([1, 2, 3]));
      await waitFor(() => expect(document.querySelectorAll("svg.spark")).toHaveLength(4));

      failOnce("series", (query) => query.get("metric") === "known");
      rerender(<Kpis state={state} params={{ ...params, date_to: "2026-11-17" }} onChange={() => undefined} />);

      await waitFor(() => expect(document.querySelectorAll("svg.spark")).toHaveLength(3));
      expect((await card("Known visitors")).querySelector("svg.spark")).toBeNull();
      expect((await card("Pageviews")).querySelector("svg.spark")).not.toBeNull();
    });

    it("keeps the cards level whether or not their trend has arrived", async () => {
      renderWith(() => rowsOf([1, 2, 3]));

      const element = await card("Sessions");
      expect(element.querySelector(".spark-slot")).not.toBeNull();
      expect((await card("Bounce rate")).querySelector(".spark-slot")).toBeNull();
      await waitFor(() => expect(element.querySelector(".spark-slot svg.spark")).not.toBeNull());
    });
  });
});
