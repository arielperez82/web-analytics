// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import type { DashboardState } from "@/lib/dashboard-state";

import { DateRangePicker } from "./DateRangePicker";

afterEach(cleanup);

type Range = DashboardState["range"];

const renderPicker = (overrides: Partial<Parameters<typeof DateRangePicker>[0]> = {}) => {
  const picked: Range[] = [];
  const zones: string[] = [];
  const view = render(
    <DateRangePicker
      range={{ days: 7 }}
      zone="Europe/Madrid"
      onChange={(next) => picked.push(next)}
      onZoneChange={(next) => zones.push(next)}
      {...overrides}
    />,
  );
  return { ...view, picked, zones };
};

const other = () => screen.getByRole("button", { name: /Europe\/Madrid/ });
const dialog = () => screen.getByRole("dialog", { name: "Date range" });

describe("DateRangePicker", () => {
  describe("quick ranges", () => {
    it("shows the four most used as buttons, in order", () => {
      renderPicker();

      const group = within(screen.getByRole("group", { name: "Quick ranges" }));
      expect(group.getAllByRole("button").map((button) => button.textContent)).toEqual([
        "Today",
        "Last 24 Hours",
        "Last 7 Days",
        "Last 30 Days",
      ]);
    });

    it("marks the one in use", () => {
      renderPicker({ range: { days: 30 } });

      expect(screen.getByRole("button", { name: "Last 30 Days", pressed: true })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Last 7 Days", pressed: false })).toBeTruthy();
    });

    it.each([
      ["Today", { days: 1 }],
      ["Last 24 Hours", { preset: "last_24_hours" }],
      ["Last 7 Days", { days: 7 }],
      ["Last 30 Days", { days: 30 }],
    ])("reports %s when picked", (label, expected) => {
      const { picked } = renderPicker({ range: { preset: "this_week" } });

      fireEvent.click(screen.getByRole("button", { name: label }));

      expect(picked).toEqual([expected]);
    });
  });

  describe("Other", () => {
    it("keeps the rest out of sight until it is opened", () => {
      renderPicker();
      expect(screen.queryByRole("dialog", { name: "Date range" })).toBeNull();

      fireEvent.click(other());

      expect(dialog()).toBeTruthy();
      expect(other().getAttribute("aria-expanded")).toBe("true");
    });

    it("lists the remaining shortcuts in calendar order", () => {
      renderPicker();
      fireEvent.click(other());

      const labels = Array.from(dialog().querySelectorAll(".presets button")).map((button) => button.textContent);
      expect(labels).toEqual([
        "Yesterday",
        "This Week",
        "This Month",
        "Last 90 Days",
        "This Year",
        "Last 12 Months",
        "All Time",
      ]);
    });

    it("reports the shortcut the viewer picks and closes", () => {
      const { picked } = renderPicker();
      fireEvent.click(other());

      fireEvent.click(within(dialog()).getByRole("button", { name: "This Week" }));

      expect(picked).toEqual([{ preset: "this_week" }]);
      expect(screen.queryByRole("dialog", { name: "Date range" })).toBeNull();
    });

    it("names the shortcut in use on its button and marks it inside", () => {
      renderPicker({ range: { preset: "this_month" } });

      expect(other().textContent).toContain("This Month");
      fireEvent.click(other());
      expect(within(dialog()).getByRole("button", { name: "This Month", pressed: true })).toBeTruthy();
      expect(within(dialog()).getByRole("button", { name: "This Week", pressed: false })).toBeTruthy();
    });

    it("names a custom range on its button", () => {
      renderPicker({ range: { from: "2026-11-01", to: "2026-11-05" } });

      expect(other().textContent).toContain("2026-11-01 → 2026-11-05");
    });

    it("names the time zone on its button", () => {
      renderPicker();

      expect(other().textContent).toContain("Europe/Madrid");
    });

    it("closes on Escape and gives focus back to its button", async () => {
      const user = userEvent.setup();
      renderPicker();
      await user.click(other());

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog", { name: "Date range" })).toBeNull();
      expect(document.activeElement).toBe(other());
    });

    it("closes on a click outside and gives focus back to its button", async () => {
      const user = userEvent.setup();
      renderPicker();
      await user.click(other());

      await user.click(document.body);

      expect(screen.queryByRole("dialog", { name: "Date range" })).toBeNull();
      expect(document.activeElement).toBe(other());
    });

    it("stays open for a click inside", async () => {
      const user = userEvent.setup();
      renderPicker();
      await user.click(other());

      await user.click(within(dialog()).getByText("From"));

      expect(dialog()).toBeTruthy();
    });
  });

  describe("custom range", () => {
    it("reports the From and To the viewer sets", () => {
      const { picked } = renderPicker();
      fireEvent.click(other());

      fireEvent.change(within(dialog()).getByLabelText("From"), { target: { value: "2020-03-02" } });
      fireEvent.change(within(dialog()).getByLabelText("To"), { target: { value: "2020-03-09" } });
      fireEvent.click(within(dialog()).getByRole("button", { name: "Apply" }));

      expect(picked).toEqual([{ from: "2020-03-02", to: "2020-03-09" }]);
      expect(screen.queryByRole("dialog", { name: "Date range" })).toBeNull();
    });

    it("cannot be applied while a date is not a real day", () => {
      renderPicker();
      fireEvent.click(other());

      fireEvent.change(within(dialog()).getByLabelText("From"), { target: { value: "" } });

      expect(within(dialog()).getByRole("button", { name: "Apply" }).hasAttribute("disabled")).toBe(true);
    });
  });

  describe("time zone", () => {
    it("is kept inside Other, out of sight until it opens", () => {
      renderPicker();
      expect(screen.queryByLabelText("Time zone")).toBeNull();

      fireEvent.click(other());

      expect((screen.getByLabelText("Time zone") as HTMLSelectElement).value).toBe("Europe/Madrid");
    });

    it("reports the zone the viewer picks and keeps Other open", () => {
      const { zones } = renderPicker();
      fireEvent.click(other());

      fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "America/New_York" } });

      expect(zones).toEqual(["America/New_York"]);
      expect(dialog()).toBeTruthy();
    });
  });

  describe("keyboard shortcut", () => {
    it("L opens Other and a second L closes it, like its button", async () => {
      const user = userEvent.setup();
      renderPicker();

      await user.keyboard("l");
      expect(dialog()).toBeTruthy();
      await user.keyboard("l");

      expect(screen.queryByRole("dialog", { name: "Date range" })).toBeNull();
    });

    it("is not triggered by typing a date", async () => {
      const user = userEvent.setup();
      renderPicker();
      await user.click(other());

      await user.click(within(dialog()).getByLabelText("From"));
      await user.keyboard("l");

      expect(dialog()).toBeTruthy();
    });

    it("shows its key on the button", () => {
      renderPicker();

      expect(within(other()).getByText("L").getAttribute("aria-hidden")).toBe("true");
    });
  });
});
