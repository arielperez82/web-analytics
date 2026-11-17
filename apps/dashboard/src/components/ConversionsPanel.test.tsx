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

const summary: ApiRow = { conversions: 70, sessions: 900, conversion_rate_percent: 7.5 };
const channelRows: readonly ApiRow[] = [
  { channel: "Paid", sessions: 100, conversions: 9, conversion_rate_percent: 8.5 },
  { channel: "Organic", sessions: 300, conversions: 40, conversion_rate_percent: 12.7 },
  { channel: "Direct", sessions: 50, conversions: 1, conversion_rate_percent: 1.9 },
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

    expect(await screen.findByText("No data")).toBeTruthy();
    expect(screen.queryByText(/sessions\s+converted/)).toBeNull();
  });

  it("shows the API error instead of a table", async () => {
    installFakeApi({});
    render(<ConversionsPanel goal={goal} params={params} />);

    await waitFor(() => expect(document.querySelector("p.error")).not.toBeNull());
    expect(screen.queryByRole("table")).toBeNull();
  });
});
