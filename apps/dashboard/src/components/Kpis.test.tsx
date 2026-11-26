// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sparkline } from "@/ds/Sparkline";
import type { DashboardState } from "@/lib/dashboard-state";
import { type ApiRow, type FakeApi, failOnce, installFakeApi, type MetricRows, removeFakeApi } from "@/test/fake-api";

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
  known_visitors_change: 20,
  anonymous_visitors_change: -10,
  sessions_change: 30,
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
  pageviews_change: 234,
  bounce_rate_change: -1.5,
  avg_session_sec_change: 0,
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
    counts?: ApiRow;
    engagement?: ApiRow;
  } = {},
) => {
  const api = installFakeApi({
    visitor_counts: [overrides.counts ?? counts],
    engagement: [overrides.engagement ?? engagement],
    series: (query) => (query.get("grain") === "hour" ? hours : (overrides.points ?? days)),
  });
  render(
    <Kpis
      state={overrides.state ?? state}
      params={overrides.params ?? params}
      comparison={"comparison" in overrides ? overrides.comparison : comparison}
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

const heardIn = (node: Node): string => {
  if (!(node instanceof Element)) return node.textContent ?? "";
  if (node.getAttribute("aria-hidden") === "true") return "";
  return Array.from(node.childNodes).map(heardIn).join(" ");
};

const heard = (element: Element | null | undefined): string =>
  element == null ? "" : heardIn(element).replace(/\s+/g, " ").trim();

const seriesRequests = (api: FakeApi) => api.requestsTo("series");

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
    expect(known.getByText("+20 (+20%)")).toBeTruthy();
    expect(known.getByText("Up")).toBeTruthy();
    expect(known.getByText("vs previous period")).toBeTruthy();
    expect(known.getByText("41.5% of sessions from people who accepted tracking")).toBeTruthy();
    expect(within(await card("Anonymous visitors")).getByText("340")).toBeTruthy();
    expect(within(await card("Sessions")).getByText("410")).toBeTruthy();
    expect(within(await card("Sessions")).getByText("+30 (+7.89%)")).toBeTruthy();
    expect(within(await card("Pageviews")).getByText("1,234")).toBeTruthy();
    expect(within(await card("Bounce rate")).getByText("37.5%")).toBeTruthy();
    expect(within(await card("Bounce rate")).getByText("-1.5 pp (-3.85%)")).toBeTruthy();
    expect(within(await card("Avg session")).getByText("95s")).toBeTruthy();
    expect(within(await card("Avg session")).getByText("0s (0%)")).toBeTruthy();
  });

  it("marks each change with a direction word and a tone that depends on which way is better", async () => {
    renderKpis();
    const change = async (name: string, text: string) => {
      const badge = within(await card(name)).getByText(text).closest(".ds-badge");
      if (badge === null) throw new Error(`no badge for ${name}`);
      return badge;
    };

    expect((await change("Known visitors", "+20 (+20%)")).getAttribute("data-tone")).toBe("good");
    expect((await change("Anonymous visitors", "-10 (-2.86%)")).getAttribute("data-tone")).toBe("bad");
    expect((await change("Bounce rate", "-1.5 pp (-3.85%)")).getAttribute("data-tone")).toBe("good");
    expect((await change("Sessions", "+30 (+7.89%)")).getAttribute("data-tone")).toBe("good");
    expect((await change("Pageviews", "+234 (+23.4%)")).getAttribute("data-tone")).toBe("good");
    expect((await change("Avg session", "0s (0%)")).getAttribute("data-tone")).toBe("neutral");
    expect(within(await card("Bounce rate")).getByText("Down")).toBeTruthy();
    expect(within(await card("Avg session")).getByText("No change")).toBeTruthy();
  });

  it("reads the direction from the change, even when the growth rounds to 0%", async () => {
    renderKpis({ counts: { ...counts, sessions_growth_percent: 0, sessions_change: 1 } });

    const sessions = within(await card("Sessions"));

    expect((await sessions.findByText("+1 (0%)")).closest(".ds-badge")?.getAttribute("data-tone")).toBe("good");
    expect(sessions.getByText("Up")).toBeTruthy();
  });

  it("reads each change aloud with its sign and unit in words", async () => {
    renderKpis();
    const change = async (name: string) => heard((await card(name)).querySelector(".delta"));

    await waitFor(async () =>
      expect(await change("Bounce rate")).toBe("Down minus 1.5 percentage points, minus 3.85 percent vs previous period"),
    );
    expect(await change("Avg session")).toBe("No change 0 seconds, 0 percent vs previous period");
    expect(await change("Anonymous visitors")).toBe("Down minus 10, minus 2.86 percent vs previous period");
    expect(await change("Known visitors")).toBe("Up plus 20, plus 20 percent vs previous period");
  });

  it("says a single second and a single percentage point in the singular", async () => {
    renderKpis({
      engagement: {
        ...engagement,
        bounce_rate_change: 1,
        bounce_rate_growth_percent: 2.56,
        avg_session_sec_change: -1,
        avg_session_sec_growth_percent: -1.05,
      },
    });
    const change = async (name: string) => heard((await card(name)).querySelector(".delta"));

    await waitFor(async () =>
      expect(await change("Bounce rate")).toBe("Up plus 1 percentage point, plus 2.56 percent vs previous period"),
    );
    expect(await change("Avg session")).toBe("Down minus 1 second, minus 1.05 percent vs previous period");
    expect(within(await card("Bounce rate")).getByText("+1 pp (+2.56%)")).toBeTruthy();
    expect(within(await card("Avg session")).getByText("-1s (-1.05%)")).toBeTruthy();
  });

  it("keeps the short change text on screen and out of what is read aloud", async () => {
    renderKpis();
    const shown = async (name: string, text: string) =>
      (await within(await card(name)).findByText(text)).getAttribute("aria-hidden");

    expect(await shown("Bounce rate", "-1.5 pp (-3.85%)")).toBe("true");
    expect(await shown("Avg session", "0s (0%)")).toBe("true");
    expect(await shown("Sessions", "+30 (+7.89%)")).toBe("true");
  });

  it("keeps the words that are read aloud off the screen", async () => {
    renderKpis();
    const hidden = async (name: string, words: string) =>
      (await within(await card(name)).findByText(words)).classList.contains("ds-sr");

    expect(await hidden("Bounce rate", "minus 1.5 percentage points, minus 3.85 percent")).toBe(true);
    expect(await hidden("Avg session", "0 seconds, 0 percent")).toBe(true);
    expect(await hidden("Sessions", "plus 30, plus 7.89 percent")).toBe(true);
  });

  it("names each metric card by its label alone and groups them as the key figures", async () => {
    renderKpis();

    expect(await screen.findByRole("group", { name: "Key figures" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sessions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pageviews" })).toBeTruthy();
  });

  it("keeps the explanations in a tooltip instead of the face of the card", async () => {
    renderKpis();

    const known = within(await card("Known visitors"));
    const explanation = await known.findByText("41.5% of sessions from people who accepted tracking");

    expect(explanation.closest("[role=tooltip]")).not.toBeNull();
    expect(known.getByText("120").closest("[role=tooltip]")).toBeNull();
  });

  it("says what the change is measured against only to those who cannot see the comparison", async () => {
    renderKpis();

    const known = within(await card("Known visitors"));

    expect((await known.findByText("vs previous period")).className).toContain("ds-sr");
  });

  it("describes a card by its figures, change and notes, and only those it has", async () => {
    renderKpis();
    const describedBy = async (name: string) => {
      const ids = (await screen.findByRole("button", { name })).getAttribute("aria-describedby") ?? "";
      return ids.split(" ").map((id) => heard(document.getElementById(id))).join(" | ");
    };

    const known = await describedBy("Known visitors");
    const sessions = await describedBy("Sessions");

    expect(known).toContain("plus 20, plus 20 percent");
    expect(known).toContain("Unique people, counted once across the range");
    expect(known).toContain("41.5% of sessions from people who accepted tracking");
    expect(sessions.split(" | ")).toEqual([
      "410",
      "Up plus 30, plus 7.89 percent vs previous period",
      "Exact for small counts, within 1% for large ones.",
    ]);
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

  it("says distinct counts are approximate in the explanation, never with a mark on the figure", async () => {
    renderKpis();
    const note = "Exact for small counts, within 1% for large ones.";
    const tipOf = async (name: string) =>
      within(await card(name)).queryByRole("tooltip", { hidden: true })?.textContent ?? "";

    await waitFor(async () => expect(within(await card("Sessions")).getByText("410").textContent).toBe("410"));
    expect(await tipOf("Sessions")).toContain(note);
    expect(await tipOf("Known visitors")).toContain(note);
    expect(await tipOf("Anonymous visitors")).toContain(note);
    expect(await tipOf("Pageviews")).toBe("");
    expect(await tipOf("Bounce rate")).toBe("");
    expect(within(await card("Known visitors")).getByText("120").textContent).toBe("120");
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

  it("draws a sparkline on the bounce rate and average session cards from their own series", async () => {
    installFakeApi({
      visitor_counts: [counts],
      engagement: [engagement],
      series: {
        ...Object.fromEntries(["sessions", "known", "anonymous", "pageviews"].map((m) => [m, days])),
        bounce_rate: days,
        avg_session: days,
      },
    });
    render(<Kpis state={state} params={params} comparison={comparison} onChange={() => undefined} />);

    await waitFor(async () => expect((await card("Bounce rate")).querySelector("svg.spark")).not.toBeNull());
    await waitFor(async () => expect((await card("Avg session")).querySelector("svg.spark")).not.toBeNull());
  });

  it("leaves no empty room on a card whose trend the server could not give", async () => {
    installFakeApi({
      visitor_counts: [counts],
      engagement: [engagement],
      series: Object.fromEntries(["sessions", "known", "anonymous", "pageviews"].map((m) => [m, days])),
    });
    render(<Kpis state={state} params={params} comparison={comparison} onChange={() => undefined} />);

    await waitFor(async () => expect((await card("Sessions")).querySelector("svg.spark")).not.toBeNull());
    expect((await card("Bounce rate")).querySelector(".spark-slot")).toBeNull();
    expect((await card("Avg session")).querySelector(".spark-slot")).toBeNull();
  });

  it("switches the chart to the metric the viewer picks without asking the server again", async () => {
    const api = installFakeApi({
      visitor_counts: [counts],
      engagement: [engagement],
      series: { ...Object.fromEntries(["sessions", "anonymous", "pageviews"].map((m) => [m, days])), known: [days[0]] },
    });
    render(<Kpis state={state} params={params} comparison={comparison} onChange={() => undefined} />);
    const chart = await screen.findByRole("group", { name: "Sessions chart" });
    await waitFor(() => expect(within(chart).getAllByRole("button")).toHaveLength(2));

    await userEvent.click(await screen.findByRole("button", { name: /^Known visitors/ }));

    await waitFor(() => expect(within(screen.getByRole("group", { name: "Known visitors chart" })).getAllByRole("button")).toHaveLength(1));
    expect(seriesRequests(api)).toHaveLength(1);
  });

  it("sends the range, the comparison and the filters to the series route as plain values", async () => {
    const api = renderKpis({ params: { ...params, location: "ES", tz: "Europe/Madrid" }, comparison });

    await waitFor(() => expect(seriesRequests(api)).toHaveLength(1));
    const query = seriesRequests(api).at(-1);
    expect(query?.get("date_from")).toBe("2026-11-10");
    expect(query?.get("compare_from")).toBe("2026-11-03");
    expect(query?.get("compare_to")).toBe("2026-11-09");
    expect(query?.get("location")).toBe("ES");
    expect(query?.get("tz")).toBe("Europe/Madrid");
    expect(query?.get("grain")).toBe("day");
  });

  it("asks for no comparison when there is none", async () => {
    const api = renderKpis({ comparison: undefined });

    await waitFor(() => expect(seriesRequests(api)).toHaveLength(1));
    await waitFor(() => expect(api.requestsTo("engagement")).toHaveLength(1));
    expect(seriesRequests(api).at(-1)?.has("compare_from")).toBe(false);
    const sent = (endpoint: string) => Object.keys(Object.fromEntries(api.requestsTo(endpoint).at(-1) ?? []));
    const compareKeys = ["compare_from", "compare_to", "compare_from_at"];
    expect(sent("visitor_counts")).toContain("date_from");
    expect(sent("visitor_counts").filter((key) => compareKeys.includes(key))).toEqual([]);
    expect(sent("engagement")).toContain("date_from");
    expect(sent("engagement").filter((key) => compareKeys.includes(key))).toEqual([]);
    expect(within(screen.getByLabelText("Chart legend")).queryByText(/Previous period/)).toBeNull();
  });

  it.each([
    { name: "days", chosen: { compare_from: "2026-11-03", compare_to: "2026-11-09" } },
    {
      name: "exact hours",
      chosen: { compare_from: "2026-11-03", compare_to: "2026-11-04", compare_from_at: "2026-11-03T09:00:00Z" },
    },
  ])("asks for the card figures against the chosen comparison in $name", async ({ chosen }) => {
    const api = renderKpis({ comparison: chosen });

    await waitFor(() => expect(api.requestsTo("engagement")).toHaveLength(1));
    const sent = (endpoint: string) => Object.fromEntries(api.requestsTo(endpoint).at(-1) ?? []);
    expect(sent("visitor_counts")).toMatchObject(chosen);
    expect(sent("engagement")).toMatchObject(chosen);
    expect(within(await card("Sessions")).getByText("+30 (+7.89%)")).toBeTruthy();
  });

  it("shows the figures without a change when nothing is compared", async () => {
    const api = renderKpis({ comparison: undefined });

    const sessions = within(await card("Sessions"));
    await waitFor(() => expect(sessions.getByText("410")).toBeTruthy());
    expect(within(await card("Bounce rate")).getByText("37.5%")).toBeTruthy();
    expect(screen.queryAllByText("vs previous period")).toHaveLength(0);
    expect(screen.queryAllByText("+30 (+7.89%)")).toHaveLength(0);
    expect(screen.queryAllByText("-1.5 pp (-3.85%)")).toHaveLength(0);
    expect(api.requestsTo("visitor_counts").at(-1)?.has("compare_from")).toBe(false);
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
    expect(seriesRequests(api).at(-1)?.get("grain")).toBe("hour");
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

    await waitFor(() => expect(seriesRequests(api)).toHaveLength(1));
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

  const legendItems = async () =>
    within(await screen.findByLabelText("Chart legend"))
      .getAllByRole("listitem")
      .map((item) => item.textContent);

  it("names the two lines This period and Previous period, without their dates", async () => {
    renderKpis({ comparison });

    expect(await legendItems()).toEqual(["This period", "Previous period"]);
  });

  it("calls the same day last week the previous period too", async () => {
    renderKpis({
      params: { ...params, date_to: "2026-11-10" },
      comparison,
      state: { ...state, compare: "last_week" },
    });

    expect(await legendItems()).toEqual(["This period", "Previous period"]);
  });

  it("is titled by metric and time group alone", async () => {
    renderKpis();

    expect(await screen.findByRole("heading", { name: "Sessions per day" })).toBeTruthy();
  });

  it("gives no reading instructions under the chart", async () => {
    renderKpis();

    await screen.findByRole("heading", { name: "Sessions per day" });
    expect(screen.queryByText(/Lines are/)).toBeNull();
  });

  it("leaves the comparison choice to the page header", async () => {
    renderKpis({ comparison });

    await screen.findByRole("group", { name: "Chart granularity" });
    expect(screen.queryByRole("group", { name: "Compare to" })).toBeNull();
  });

  describe("the last 24 hours", () => {
    const last24 = { date_from: "2026-11-09", date_to: "2026-11-10", from_at: "2026-11-09T16:00:00Z" };
    const last24Comparison = { compare_from: "2026-11-08", compare_to: "2026-11-09", compare_from_at: "2026-11-08T16:00:00Z" };
    const range = { ...state, range: { preset: "last_24_hours" } } as DashboardState;

    it("sends the exact start and the start of the comparison to the series route, by the hour", async () => {
      const api = renderKpis({ params: { ...params, ...last24 }, comparison: last24Comparison, state: range });

      await waitFor(() => expect(seriesRequests(api)).toHaveLength(1));
      const query = seriesRequests(api).at(-1);
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

    it("is titled by the hour", async () => {
      renderKpis({ params: { ...params, ...last24 }, comparison: last24Comparison, state: range });

      expect(await screen.findByRole("heading", { name: "Sessions per hour" })).toBeTruthy();
    });

    it("names the lines in the legend the same way as any range", async () => {
      renderKpis({ params: { ...params, ...last24 }, comparison: last24Comparison, state: range });

      expect(await legendItems()).toEqual(["This period", "Previous period"]);
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

    it("moves focus to the chart panel when Retry is pressed, so it is not lost with the alert", async () => {
      installFakeApi({ visitor_counts: [counts], engagement: [engagement], series: days });
      failOnce("series", (query) => query.has("compare_from"));
      render(<Kpis state={state} params={params} comparison={comparison} onChange={() => undefined} />);

      await userEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Retry" }));

      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
      expect(document.activeElement).toBe(screen.getByRole("region", { name: /^Sessions per day/ }));
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
    const rowsOf = (values: readonly number[], previous: number | null = null) =>
      values.map((current, index) => ({
        label: `2026-11-1${String(index)}`,
        current,
        previousLabel: previous === null ? null : `2026-11-0${String(index)}`,
        previous,
      }));
    const pathOf = (values: readonly number[]) => {
      const { container } = render(<Sparkline points={rowsOf(values)} />);
      const d = container.querySelector("path")?.getAttribute("d");
      cleanup();
      return d;
    };
    const renderWith = (
      series: ApiRow[] | MetricRows | ((query: URLSearchParams) => readonly ApiRow[] | MetricRows),
      props: { params?: Record<string, string>; comparison?: typeof comparison } = {},
    ) => {
      const api = installFakeApi({ visitor_counts: [counts], engagement: [engagement], series });
      const view = render(
        <Kpis state={state} params={props.params ?? params} comparison={props.comparison} onChange={() => undefined} />,
      );
      return { api, ...view };
    };
    const sparkOf = (element: HTMLElement) => element.querySelector("path.spark-line")?.getAttribute("d");
    const everyTrend = (previous: number | null) =>
      Object.fromEntries(Object.entries(TRENDS).map(([metric, values]) => [metric, rowsOf(values, previous)]));

    it.each([
      ["Known visitors", "known"],
      ["Anonymous visitors", "anonymous"],
      ["Sessions", "sessions"],
      ["Pageviews", "pageviews"],
    ] as const)("draws the %s card from that metric's own series, on its own scale", async (label, metric) => {
      const expected = pathOf(TRENDS[metric]);
      renderWith(everyTrend(1000), { comparison });

      const element = await card(label);
      await waitFor(() => expect(sparkOf(element)).toBe(expected));
    });

    it("makes one request for the chart and all four trends, over the page's own range, filters and grain", async () => {
      const filtered = { ...params, country: "ES" };
      const { api } = renderWith(rowsOf([1, 2, 3]), { params: filtered, comparison });

      await waitFor(() => expect(document.querySelectorAll("svg.spark")).toHaveLength(4));
      expect(api.requestsTo("series")).toHaveLength(1);
      const query = api.requestsTo("series")[0];
      expect(Object.fromEntries(query ?? [])).toMatchObject({ ...filtered, ...comparison, grain: "day" });
      expect(query?.has("metric")).toBe(false);
    });

    it("asks for hours over an exact window", async () => {
      const last24 = { ...params, from_at: "2026-11-09T16:00:00Z" };
      const { api } = renderWith(rowsOf([1, 2, 3]), { params: last24 });

      await waitFor(() => expect(document.querySelectorAll("svg.spark")).toHaveLength(4));
      expect(Object.fromEntries(api.requestsTo("series")[0] ?? [])).toMatchObject({
        from_at: "2026-11-09T16:00:00Z",
        grain: "hour",
      });
    });

    it("hides the sparkline when the API supplies no trend", async () => {
      renderWith([]);

      await screen.findByText(/No data for this range/);
      expect(document.querySelectorAll("svg.spark")).toHaveLength(0);
    });

    it("draws none for the cards that have no trend metric", async () => {
      renderWith(rowsOf([1, 2, 3]));

      await waitFor(() => expect(document.querySelectorAll("svg.spark")).toHaveLength(4));
      expect((await card("Bounce rate")).querySelector("svg.spark")).toBeNull();
      expect((await card("Avg session")).querySelector("svg.spark")).toBeNull();
    });

    it("keeps the last trends beside the alert that says they are old when a refresh fails", async () => {
      const { rerender } = renderWith(rowsOf([1, 2, 3]));
      await waitFor(() => expect(document.querySelectorAll("svg.spark")).toHaveLength(4));

      failOnce("series");
      rerender(<Kpis state={state} params={{ ...params, date_to: "2026-11-17" }} onChange={() => undefined} />);

      expect((await screen.findByRole("alert")).textContent).toContain("last figures that loaded");
      expect(document.querySelectorAll("svg.spark")).toHaveLength(4);
    });

    it("keeps the other cards and the chart when one metric is unavailable, and says so only for that metric", async () => {
      const { pageviews: _missing, ...others } = everyTrend(null);
      renderWith(others);

      await waitFor(() => expect(document.querySelectorAll("svg.spark")).toHaveLength(3));
      expect(screen.queryByRole("alert")).toBeNull();

      await userEvent.click(await card("Pageviews"));

      expect((await screen.findByRole("alert")).textContent).toMatch(/Pageviews.*not available/);
      expect(document.querySelectorAll("svg.spark")).toHaveLength(3);

      await userEvent.click(await card("Sessions"));

      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    });

    it("keeps the cards level whether or not their trend has arrived", async () => {
      renderWith(rowsOf([1, 2, 3]));

      const element = await card("Sessions");
      expect(element.querySelector(".spark-slot")).not.toBeNull();
      await waitFor(() => expect(element.querySelector(".spark-slot svg.spark")).not.toBeNull());
    });
  });
});
