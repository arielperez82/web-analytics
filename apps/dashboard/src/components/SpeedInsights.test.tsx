// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { type ApiRow, installFakeApi, removeFakeApi } from "@/test/fake-api";

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
    const labels = Array.from(document.querySelectorAll(".card span")).map((span) => span.textContent);
    expect(labels).toEqual(["LCP p75", "TTFB p75"]);
    expect(screen.getByText("2,100.5")).toBeTruthy();
  });
});
