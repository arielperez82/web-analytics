// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DashboardState } from "@/lib/dashboard-state";
import { type ApiRow, failOnce, installFakeApi, removeFakeApi } from "@/test/fake-api";

import { OverviewSpeed } from "./OverviewSpeed";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(""),
}));

afterEach(() => {
  cleanup();
  removeFakeApi();
});

const params = { date_from: "2026-11-10", date_to: "2026-11-16", domain: "a.example", tz: "Asia/Tokyo" };
const state: DashboardState = { range: { days: 7 }, domain: "a.example", filters: {} };

const vital = (metric_name: string, p75: number, extra: ApiRow = {}): ApiRow => ({
  domain: "a.example",
  metric_name,
  p75,
  units: metric_name === "CLS" ? "score" : "ms",
  status: "Good",
  ...extra,
});

const renderPanel = (vitals: readonly ApiRow[], comparison?: { compare_from: string; compare_to: string }) => {
  const api = installFakeApi({ web_vitals_current: vitals });
  render(<OverviewSpeed state={state} params={params} comparison={comparison} />);
  return api;
};

const spokenOf = (badge: HTMLElement): string | undefined =>
  Array.from(badge.querySelectorAll(".ds-sr")).at(-1)?.textContent ?? undefined;

describe("OverviewSpeed", () => {
  it("shows the three core vitals at the 75th percentile as the API returned them, in vitals order", async () => {
    renderPanel([vital("TTFB", 400), vital("CLS", 0.08), vital("INP", 180), vital("LCP", 2100.5)]);

    await screen.findByText("LCP p75");
    const labels = Array.from(document.querySelectorAll(".vital-name")).map((label) => label.textContent);
    expect(labels).toEqual(["LCP p75", "INP p75", "CLS p75"]);
    expect(screen.getByText("2,100.5")).toBeTruthy();
    expect(screen.getByText("0.08")).toBeTruthy();
  });

  it("is a Speed panel linking to the Speed page", async () => {
    renderPanel([vital("LCP", 2100)]);

    await screen.findByText("LCP p75");
    expect(screen.getByRole("heading", { level: 2, name: "Speed" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "See all" }).getAttribute("href")).toContain("/speed");
  });

  it("asks only for the vitals, with the shared filters, tenant, window and no comparison", async () => {
    const api = installFakeApi({ web_vitals_current: [vital("LCP", 2100)] });
    render(
      <OverviewSpeed
        state={state}
        params={{ ...params, tenant_id: "acme", from_at: "2026-11-15T16:00:00Z", location: "ES", device: "mobile-ios", browser: "safari", include_bots: "1" }}
      />,
    );

    await screen.findByText("LCP p75");
    const query = api.requestsTo("web_vitals_current")[0];
    expect(api.requestsTo("web_vitals_routes")).toHaveLength(0);
    expect(query?.get("tenant_id")).toBe("acme");
    expect(query?.get("from_at")).toBe("2026-11-15T16:00:00Z");
    expect(query?.get("location")).toBe("ES");
    expect(query?.get("device")).toBe("mobile-ios");
    expect(query?.get("browser")).toBe("safari");
    expect(query?.get("include_bots")).toBe("1");
    expect(query?.get("date_from")).toBe("2026-11-10");
    expect(query?.has("include_previous_period")).toBe(false);
  });

  it("asks for the chosen comparison period", async () => {
    const api = renderPanel([vital("LCP", 2100)], { compare_from: "2026-11-03", compare_to: "2026-11-09" });

    await screen.findByText("LCP p75");
    const query = api.requestsTo("web_vitals_current")[0];
    expect(query?.get("include_previous_period")).toBe("true");
    expect(query?.get("compare_from")).toBe("2026-11-03");
    expect(query?.get("compare_to")).toBe("2026-11-09");
  });

  it.each([
    ["Good", "good"],
    ["Needs Improvement", "warn"],
    ["Poor", "bad"],
  ])("shows a %s vital as a %s badge with the status written out", async (status, tone) => {
    renderPanel([vital("LCP", 2100, { status })]);

    expect((await screen.findByText(status)).getAttribute("data-tone")).toBe(tone);
  });

  it("shows no change while not comparing", async () => {
    renderPanel([vital("LCP", 2100, { previous_p75: 2300, p75_change: -200, p75_change_percent: -8.7 })]);

    await screen.findByText("LCP p75");
    expect(screen.queryByText(/8\.7/)).toBeNull();
  });

  it("shows a faster vital as a good change and speaks it in words with the unit", async () => {
    renderPanel([vital("LCP", 2100, { previous_p75: 2300, p75_change: -200, p75_change_percent: -8.69 })], {
      compare_from: "2026-11-03",
      compare_to: "2026-11-09",
    });

    const text = await screen.findByText("-200 (-8.69%)");
    const badge = text.closest<HTMLElement>(".ds-badge");
    expect(badge?.getAttribute("data-tone")).toBe("good");
    expect(text.getAttribute("aria-hidden")).toBe("true");
    expect(badge && spokenOf(badge)).toBe("minus 200 milliseconds, minus 8.69 percent");
  });

  it("shows a slower vital as a bad change", async () => {
    renderPanel([vital("INP", 300, { previous_p75: 200, p75_change: 100, p75_change_percent: 50 })], {
      compare_from: "2026-11-03",
      compare_to: "2026-11-09",
    });

    const badge = (await screen.findByText("+100 (+50%)")).closest<HTMLElement>(".ds-badge");
    expect(badge?.getAttribute("data-tone")).toBe("bad");
  });

  it("says so when a vital has no earlier figure", async () => {
    renderPanel([vital("LCP", 2100, { previous_p75: null, p75_change: null, p75_change_percent: null })], {
      compare_from: "2026-11-03",
      compare_to: "2026-11-09",
    });

    expect(await screen.findByText("No earlier data")).toBeTruthy();
  });

  it("names the domain of each vital when several domains are shown", async () => {
    renderPanel([vital("LCP", 2100), { ...vital("LCP", 1900), domain: "b.example" }]);

    expect(await screen.findByText("LCP p75 · a.example")).toBeTruthy();
    expect(screen.getByText("LCP p75 · b.example")).toBeTruthy();
  });

  it("says when there is no data, and retries a failed load", async () => {
    const api = installFakeApi({ web_vitals_current: [vital("LCP", 2100)] });
    failOnce("web_vitals_current");
    render(<OverviewSpeed state={state} params={params} />);

    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("LCP p75")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(api.requestsTo("web_vitals_current")).toHaveLength(1);
  });
});
