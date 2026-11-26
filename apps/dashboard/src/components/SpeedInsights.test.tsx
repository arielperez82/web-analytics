// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { type ApiRow, failOnce, installFakeApi, removeFakeApi } from "@/test/fake-api";

import { SpeedInsights } from "./SpeedInsights";

afterEach(() => {
  cleanup();
  removeFakeApi();
});

const params = { date_from: "2026-11-10", date_to: "2026-11-16", days: "7", domain: "a.example", tz: "Asia/Tokyo" };

const vital = (metric_name: string, p75: number): ApiRow => ({
  domain: "a.example",
  metric_name,
  p75,
  units: "ms",
  status: "Good",
});

const renderPage = (vitals: readonly ApiRow[] = [vital("LCP", 2100)], pageParams: Record<string, string> = params) => {
  const api = installFakeApi({ web_vitals_current: vitals, web_vitals_routes: [] });
  render(<SpeedInsights params={pageParams} />);
  return api;
};

describe("SpeedInsights", () => {
  it("asks both endpoints for the same visitor filters as the rest of the dashboard", async () => {
    const api = renderPage(undefined, {
      ...params,
      location: "ES",
      device: "mobile-ios",
      browser: "safari",
      include_bots: "1",
    });

    await screen.findByText("LCP p75");
    await waitFor(() => expect(api.requestsTo("web_vitals_routes")).toHaveLength(1));
    for (const endpoint of ["web_vitals_current", "web_vitals_routes"]) {
      const query = api.requestsTo(endpoint)[0];
      expect(query?.get("location")).toBe("ES");
      expect(query?.get("device")).toBe("mobile-ios");
      expect(query?.get("browser")).toBe("safari");
      expect(query?.get("include_bots")).toBe("1");
    }
  });

  it("asks both endpoints for the picked tenant and the exact start of the window", async () => {
    const api = renderPage(undefined, { ...params, tenant_id: "acme", from_at: "2026-11-15T16:00:00Z" });

    await screen.findByText("LCP p75");
    await waitFor(() => expect(api.requestsTo("web_vitals_routes")).toHaveLength(1));
    for (const endpoint of ["web_vitals_current", "web_vitals_routes"]) {
      const query = api.requestsTo(endpoint)[0];
      expect(query?.get("tenant_id")).toBe("acme");
      expect(query?.get("from_at")).toBe("2026-11-15T16:00:00Z");
    }
  });

  it("asks both endpoints for the dates of the range, not a number of days", async () => {
    const api = renderPage();

    await screen.findByText("LCP p75");
    await waitFor(() => expect(api.requestsTo("web_vitals_routes")).toHaveLength(1));
    for (const endpoint of ["web_vitals_current", "web_vitals_routes"]) {
      const query = api.requestsTo(endpoint)[0];
      expect(query?.get("date_from")).toBe("2026-11-10");
      expect(query?.get("date_to")).toBe("2026-11-16");
      expect(query?.get("domain")).toBe("a.example");
      expect(query?.has("days")).toBe(false);
      expect(query?.get("tz")).toBe("Asia/Tokyo");
    }
  });

  it("shows each vital's p75 as the API returned it, in the vitals order", async () => {
    renderPage([vital("TTFB", 400), vital("LCP", 2100.5)]);

    await screen.findByText("LCP p75");
    const labels = Array.from(document.querySelectorAll(".card>span:not(.ds-badge)")).map((span) => span.textContent);
    expect(labels).toEqual(["LCP p75", "TTFB p75"]);
    expect(screen.getByText("2,100.5")).toBeTruthy();
  });

  it("retries only the panel that failed, and brings its rows back", async () => {
    const api = installFakeApi({
      web_vitals_current: [vital("LCP", 2100)],
      web_vitals_routes: [{ domain: "a.example", route: "/checkout", overall_score: 80, lcp_avg: 1, inp_avg: 2, cls_avg: 0 }],
    });
    failOnce("web_vitals_routes");
    render(<SpeedInsights params={params} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("warehouse down");
    await screen.findByText("LCP p75");

    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("/checkout")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(api.requestsTo("web_vitals_current")).toHaveLength(1);
  });

  it.each([
    ["Excellent", "good"],
    ["Good", "good"],
    ["Needs Improvement", "warn"],
    ["Poor", "bad"],
    ["Something new", "neutral"],
  ])("shows a %s vital as a %s badge, with the status written out", async (status, tone) => {
    renderPage([{ ...vital("LCP", 2100), status }]);

    const badge = await screen.findByText(status);

    expect(badge.getAttribute("data-tone")).toBe(tone);
  });

  describe("compared with another period", () => {
    const comparison = { compare_from: "2026-11-03", compare_to: "2026-11-09" };
    const route = (overall_score_change: number | null): ApiRow => ({
      domain: "a.example",
      route: "/checkout",
      overall_score: 80,
      lcp_avg: 1,
      inp_avg: 2,
      cls_avg: 0,
      previous_overall_score: overall_score_change === null ? null : 70,
      overall_score_change,
    });
    const renderCompared = (vitals: readonly ApiRow[], routes: readonly ApiRow[] = []) => {
      const api = installFakeApi({ web_vitals_current: vitals, web_vitals_routes: routes });
      render(<SpeedInsights params={params} comparison={comparison} />);
      return api;
    };

    it("asks both endpoints for the figures of the chosen period", async () => {
      const api = renderCompared([vital("LCP", 2100)]);

      await screen.findByText("LCP p75");
      await waitFor(() => expect(api.requestsTo("web_vitals_routes")).toHaveLength(1));
      for (const endpoint of ["web_vitals_current", "web_vitals_routes"]) {
        const query = api.requestsTo(endpoint)[0];
        expect(query?.get("include_previous_period")).toBe("true");
        expect(query?.get("compare_from")).toBe("2026-11-03");
        expect(query?.get("compare_to")).toBe("2026-11-09");
      }
    });

    it("asks for no comparison when none is chosen", async () => {
      const api = renderPage([{ ...vital("LCP", 2100), previous_p75: 2300, p75_change: -200, p75_change_percent: -8.7 }]);

      await screen.findByText("LCP p75");
      await waitFor(() => expect(api.requestsTo("web_vitals_routes")).toHaveLength(1));
      for (const endpoint of ["web_vitals_current", "web_vitals_routes"]) {
        const query = api.requestsTo(endpoint)[0];
        expect(query?.has("include_previous_period")).toBe(false);
        expect(query?.has("compare_from")).toBe(false);
      }
      expect(screen.queryByText(/8\.7%/)).toBeNull();
      expect(screen.queryByRole("columnheader", { name: "Score vs previous" })).toBeNull();
    });

    it("shows a vital that got faster as a good change, with the API's figures", async () => {
      renderCompared([{ ...vital("LCP", 2100), previous_p75: 2300, p75_change: -200, p75_change_percent: -8.7 }]);

      const badge = await screen.findByText("-200 (-8.7%)", { exact: false });

      expect(badge.getAttribute("data-tone")).toBe("good");
      expect(within(badge).getByText("Down")).toBeTruthy();
      expect(screen.getByText("was 2,300 ms")).toBeTruthy();
    });

    it("shows a vital that got slower as a bad change", async () => {
      renderCompared([{ ...vital("LCP", 2100), previous_p75: 1600, p75_change: 500, p75_change_percent: 31.25 }]);

      const badge = await screen.findByText("+500 (+31.25%)", { exact: false });

      expect(badge.getAttribute("data-tone")).toBe("bad");
      expect(within(badge).getByText("Up")).toBeTruthy();
    });

    it("shows a change without a percentage when the API gives none", async () => {
      renderCompared([{ ...vital("CLS", 0.2), previous_p75: 0, p75_change: 0.2, p75_change_percent: null }]);

      const badge = await screen.findByText("+0.2", { exact: false });

      expect(badge.textContent).not.toContain("%");
      expect(badge.getAttribute("data-tone")).toBe("bad");
    });

    it("says so when a vital was not measured in the chosen period", async () => {
      renderCompared([{ ...vital("LCP", 2100), previous_p75: null, p75_change: null, p75_change_percent: null }]);

      expect(await screen.findByText("No earlier data")).toBeTruthy();
    });

    it("shows each route's score change, a rise being good", async () => {
      renderCompared([vital("LCP", 2100)], [route(10)]);

      expect(await screen.findByRole("columnheader", { name: "Score vs previous" })).toBeTruthy();
      const badge = await screen.findByText("+10", { exact: false });
      expect(badge.getAttribute("data-tone")).toBe("good");
      expect(within(badge).getByText("Up")).toBeTruthy();
    });

    it("shows a fallen route score as a bad change, and none where the API gives none", async () => {
      renderCompared([vital("LCP", 2100)], [route(-12.5), { ...route(null), route: "/new" }]);

      const badge = await screen.findByText("-12.5", { exact: false });
      expect(badge.getAttribute("data-tone")).toBe("bad");
      const fresh = (await screen.findByText("/new")).closest("tr");
      expect(fresh?.querySelector(".ds-badge")).toBeNull();
      expect(fresh?.lastElementChild?.textContent).toBe("—");
    });
  });
});
