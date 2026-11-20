// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Filters } from "@/lib/filters";
import { installFakeApi, removeFakeApi } from "@/test/fake-api";

import { FilterMenu } from "./FilterMenu";

afterEach(() => {
  cleanup();
  removeFakeApi();
});

const params = { date_from: "2026-11-10", date_to: "2026-11-16", domain: "a.example" };

const routes = {
  top_locations: [{ location: "ES", sessions: 10 }, { location: "FR", sessions: 8 }],
  top_devices: [{ device: "desktop", sessions: 9 }, { device: "mobile-ios", sessions: 4 }],
  top_browsers: [{ browser: "Chrome", sessions: 12 }, { browser: "Safari", sessions: 3 }],
};

const renderMenu = (filters: Filters = {}, onChange: (filters: Filters) => void = () => undefined) => {
  const api = installFakeApi(routes);
  render(<FilterMenu filters={filters} params={{ ...params, ...filters }} onChange={onChange} />);
  return api;
};

const openMenu = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Filters/ }));
  return user;
};

const optionValues = (label: string) =>
  Array.from(screen.getByLabelText(label).querySelectorAll("option")).map((option) => option.value);

describe("FilterMenu", () => {
  it("asks for nothing until it is opened", () => {
    const api = renderMenu();

    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();
    expect(api.requestsTo("top_locations")).toHaveLength(0);
  });

  it("offers any country, device and browser the API lists", async () => {
    renderMenu();
    await openMenu();

    await waitFor(() => expect(optionValues("Country")).toEqual(["", "ES", "FR"]));
    await waitFor(() => expect(optionValues("Device")).toEqual(["", "desktop", "mobile-ios"]));
    await waitFor(() => expect(optionValues("Browser")).toEqual(["", "Chrome", "Safari"]));
  });

  it("filters by the value the viewer picks, keeping the other filters", async () => {
    const onChange = vi.fn();
    renderMenu({ device: "desktop" }, onChange);
    const user = await openMenu();
    await waitFor(() => expect(optionValues("Country")).toContain("FR"));

    await user.selectOptions(screen.getByLabelText("Country"), "FR");

    expect(onChange).toHaveBeenCalledWith({ device: "desktop", location: "FR" });
  });

  it("drops a filter when the viewer picks any", async () => {
    const onChange = vi.fn();
    renderMenu({ location: "ES", device: "desktop" }, onChange);
    const user = await openMenu();
    await waitFor(() => expect(optionValues("Country")).toContain("ES"));

    await user.selectOptions(screen.getByLabelText("Country"), "");

    expect(onChange).toHaveBeenCalledWith({ device: "desktop" });
  });

  it("lists the countries without the country filter that is already set", async () => {
    const api = renderMenu({ location: "ES", device: "desktop" });
    await openMenu();

    await waitFor(() => expect(api.requestsTo("top_locations").length).toBeGreaterThan(0));
    const query = api.requestsTo("top_locations")[0];
    expect(query?.get("location")).toBeNull();
    expect(query?.get("device")).toBe("desktop");
  });

  it("keeps a filtered value selectable when the list does not include it", async () => {
    renderMenu({ location: "JP" });
    await openMenu();

    await waitFor(() => expect((screen.getByLabelText("Country") as HTMLSelectElement).value).toBe("JP"));
  });

  it("counts the filters in use on its button", () => {
    renderMenu({ location: "ES", browser: "Chrome" });

    expect(within(screen.getByRole("button", { name: /^Filters/ })).getByText("2")).toBeTruthy();
  });
});
