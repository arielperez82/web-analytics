// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Goal } from "@/lib/goals";
import { type ApiRow, installFakeApi, removeFakeApi } from "@/test/fake-api";

import { ConversionsPanel } from "./ConversionsPanel";

afterEach(() => {
  cleanup();
  removeFakeApi();
});

const goal: Goal = { name: "Signup", path: "/thanks" };
const params = { date_from: "2026-11-10", date_to: "2026-11-16", domain: "a.example" };

const summary: ApiRow = { conversions: 70, sessions: 900, denominator: 900, conversion_rate_percent: 7.5 };
const channelRows: readonly ApiRow[] = [
  { channel: "Paid", sessions: 100, denominator: 100, conversions: 9, conversion_rate_percent: 8.5 },
  { channel: "Organic", sessions: 300, denominator: 300, conversions: 40, conversion_rate_percent: 12.7 },
  { channel: "Direct", sessions: 50, denominator: 50, conversions: 1, conversion_rate_percent: 1.9 },
];

const renderPanel = (routes: Parameters<typeof installFakeApi>[0] = {}) => {
  const api = installFakeApi({ conversions: channelRows, conversion_summary: [summary], ...routes });
  render(<ConversionsPanel goal={goal} params={params} />);
  return api;
};

describe("ConversionsPanel", () => {
  it("takes the headline from the summary, not from the channel rows", async () => {
    renderPanel();

    const headline = await screen.findByText(/sessions\s+converted/);
    expect(headline.textContent).toBe("70 of 900 sessions converted (7.5%)");
  });

  it("shows each channel row exactly as the API computed it", async () => {
    renderPanel();

    await screen.findByText("Organic");
    const cells = Array.from(document.querySelectorAll("tbody tr")).map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent),
    );
    expect(cells).toEqual([
      ["Paid", "100", "9", "8.5%"],
      ["Organic", "300", "40", "12.7%"],
      ["Direct", "50", "1", "1.9%"],
    ]);
  });

  it("keeps the order the API ranked the channels in", async () => {
    renderPanel();

    await screen.findByText("Organic");
    const labels = Array.from(document.querySelectorAll("td.label")).map((cell) => cell.textContent);
    expect(labels).toEqual(["Paid", "Organic", "Direct"]);
  });

  it("names the goal and its path in the title", async () => {
    renderPanel();

    expect(await screen.findByRole("heading", { name: "Signup · /thanks" })).toBeTruthy();
  });

  it("asks both endpoints about the goal path over the same range", async () => {
    const api = renderPanel();

    await screen.findByText("Organic");
    await waitFor(() => expect(api.requestsTo("conversion_summary")).toHaveLength(1));
    for (const endpoint of ["conversions", "conversion_summary"]) {
      const query = api.requestsTo(endpoint)[0];
      expect(query?.get("goal_path")).toBe("/thanks");
      expect(query?.get("date_from")).toBe("2026-11-10");
      expect(query?.get("domain")).toBe("a.example");
    }
  });

  it("says there is no data instead of a headline when no channel converted", async () => {
    renderPanel({ conversions: [] });

    expect(await screen.findByText("No data for this range. Try a wider range or fewer filters.")).toBeTruthy();
    expect(screen.queryByText(/sessions\s+converted/)).toBeNull();
  });

  it("shows the API error instead of a table", async () => {
    installFakeApi({});
    render(<ConversionsPanel goal={goal} params={params} />);

    await waitFor(() => expect(document.querySelector("p.error")).not.toBeNull());
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("asks for the goal event, and shows its name, when the goal is an event", async () => {
    const api = installFakeApi({ conversions: channelRows, conversion_summary: [summary] });
    render(<ConversionsPanel goal={{ name: "Signed up", event: "signup_completed" }} params={params} />);

    await screen.findByText(/sessions\s+converted/);

    expect(screen.getByText("Signed up · signup_completed")).toBeTruthy();
    const queries = [...api.requestsTo("conversions"), ...api.requestsTo("conversion_summary")];
    expect(queries).toHaveLength(2);
    expect(queries.map((query) => query.get("goal_event"))).toEqual(["signup_completed", "signup_completed"]);
    expect(queries.some((query) => query.has("goal_path"))).toBe(false);
  });

  it("asks for the event pattern, and says it is a pattern, when the goal matches by pattern", async () => {
    const api = installFakeApi({ conversions: channelRows, conversion_summary: [summary] });
    render(<ConversionsPanel goal={{ name: "Any signup", eventPattern: "signup_.*" }} params={params} />);

    await screen.findByText(/sessions\s+converted/);

    expect(screen.getByText("Any signup · pattern signup_.*")).toBeTruthy();
    const queries = [...api.requestsTo("conversions"), ...api.requestsTo("conversion_summary")];
    expect(queries.map((query) => query.get("goal_event_pattern"))).toEqual(["signup_.*", "signup_.*"]);
    expect(queries.some((query) => query.has("goal_path") || query.has("goal_event"))).toBe(false);
  });

  describe("denominator", () => {
    const cellsOf = () =>
      Array.from(document.querySelectorAll("tbody tr")).map((row) =>
        Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent),
      );
    const headersOf = () => Array.from(document.querySelectorAll("th")).map((cell) => cell.textContent);
    const renderGoal = (denominator?: "session" | "visitor" | "page_view" | "none", routes: Parameters<typeof installFakeApi>[0] = {}) => {
      const api = installFakeApi({ conversions: channelRows, conversion_summary: [summary], ...routes });
      render(<ConversionsPanel goal={{ ...goal, ...(denominator === undefined ? {} : { denominator }) }} params={params} />);
      return api;
    };

    it("says the rate is per session, and that this is the default, when the goal chose nothing", async () => {
      const api = renderGoal();

      await screen.findByText("Organic");
      expect(screen.getByText("Rate per session (default)")).toBeTruthy();
      expect(api.requestsTo("conversions")[0]?.has("goal_denominator")).toBe(false);
      expect(headersOf()).toEqual(["Channel", "Sessions", "Conversions", "Rate"]);
    });

    it("does not call a chosen session denominator the default", async () => {
      const api = renderGoal("session");

      await screen.findByText("Organic");
      expect(screen.getByText("Rate per session")).toBeTruthy();
      expect(api.requestsTo("conversions")[0]?.get("goal_denominator")).toBe("session");
    });

    it("shows visitors as the denominator the API returned", async () => {
      const api = renderGoal("visitor", {
        conversion_summary: [{ conversions: 40, sessions: 90, denominator: 80, conversion_rate_percent: 50 }],
        conversions: [{ channel: "Paid", sessions: 90, denominator: 80, conversions: 40, conversion_rate_percent: 50 }],
      });

      const headline = await screen.findByText(/visitors\s+converted/);
      expect(headline.textContent).toBe("40 of 80 visitors converted (50%)");
      expect(screen.getByText("Rate per visitor")).toBeTruthy();
      expect(headersOf()).toEqual(["Channel", "Visitors", "Conversions", "Rate"]);
      expect(cellsOf()).toEqual([["Paid", "80", "40", "50%"]]);
      expect(api.requestsTo("conversion_summary")[0]?.get("goal_denominator")).toBe("visitor");
    });

    it("shows page views as the denominator the API returned", async () => {
      renderGoal("page_view", {
        conversion_summary: [{ conversions: 9, sessions: 30, denominator: 120, conversion_rate_percent: 7.5 }],
        conversions: [{ channel: "Paid", sessions: 30, denominator: 120, conversions: 9, conversion_rate_percent: 7.5 }],
      });

      const headline = await screen.findByText(/page views/);
      expect(headline.textContent).toBe("9 sessions converted from 120 page views (7.5%)");
      expect(screen.getByText("Rate per page view")).toBeTruthy();
      expect(headersOf()).toEqual(["Channel", "Page views", "Conversions", "Rate"]);
    });

    it("shows a count and no rate for an absolute goal", async () => {
      renderGoal("none", {
        conversion_summary: [{ conversions: 12, sessions: 30, denominator: null, conversion_rate_percent: null }],
        conversions: [{ channel: "Paid", sessions: 30, denominator: null, conversions: 9, conversion_rate_percent: null }],
      });

      const headline = await screen.findByText(/converted/);
      expect(headline.textContent).toBe("12 sessions converted");
      expect(screen.getByText("Count only, no rate")).toBeTruthy();
      expect(headersOf()).toEqual(["Channel", "Conversions"]);
      expect(cellsOf()).toEqual([["Paid", "9"]]);
      expect(document.body.textContent).not.toContain("%");
    });
  });
});
