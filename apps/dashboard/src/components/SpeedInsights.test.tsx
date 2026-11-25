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

const renderPage = (vitals: readonly ApiRow[] = [vital("LCP", 2100)]) => {
  const api = installFakeApi({ web_vitals_current: vitals, web_vitals_routes: [] });
  render(<SpeedInsights params={params} />);
  return api;
};

describe("SpeedInsights", () => {
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
});
