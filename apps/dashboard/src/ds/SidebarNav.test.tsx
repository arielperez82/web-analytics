// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { SidebarNav, type SidebarNavProps } from "./SidebarNav";

afterEach(cleanup);

const items: SidebarNavProps["items"] = [
  { href: "/", label: "Analytics", icon: "chart", active: true },
  { href: "/speed", label: "Speed Insights", icon: "gauge", active: false },
];

const renderNav = (overrides: Partial<SidebarNavProps> = {}) => {
  const toggles: boolean[] = [];
  const view = render(
    <SidebarNav items={items} collapsed={false} onToggle={() => toggles.push(true)} {...overrides} />,
  );
  return { ...view, toggles };
};

describe("SidebarNav", () => {
  it("lists the pages as links and marks the current one", () => {
    renderNav();
    const nav = within(screen.getByRole("navigation", { name: "Main" }));

    expect(nav.getByRole("link", { name: "Analytics" }).getAttribute("aria-current")).toBe("page");
    expect(nav.getByRole("link", { name: "Speed Insights" }).getAttribute("aria-current")).toBeNull();
  });

  it("keeps every link's name when collapsed", () => {
    renderNav({ collapsed: true });

    expect(screen.getByRole("link", { name: "Analytics" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Speed Insights" }).getAttribute("href")).toBe("/speed");
    expect(screen.getByRole("navigation", { name: "Main" }).getAttribute("data-collapsed")).toBe("true");
  });

  it("tells whether it is open or collapsed through one stable button", () => {
    const open = renderNav();
    expect(screen.getByRole("button", { name: "Sidebar" }).getAttribute("aria-expanded")).toBe("true");
    open.unmount();

    renderNav({ collapsed: true });
    expect(screen.getByRole("button", { name: "Sidebar" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("asks to toggle when the button is pressed", async () => {
    const user = userEvent.setup();
    const { toggles } = renderNav();

    await user.click(screen.getByRole("button", { name: "Sidebar" }));

    expect(toggles).toHaveLength(1);
  });

  it("shows the page name beside a collapsed icon on hover and on keyboard focus", async () => {
    const user = userEvent.setup();
    renderNav({ collapsed: true });

    await user.hover(screen.getByRole("link", { name: "Speed Insights" }));
    expect(within(screen.getByRole("tooltip")).getByText("Speed Insights")).toBeTruthy();
    await user.unhover(screen.getByRole("link", { name: "Speed Insights" }));
    expect(screen.queryByRole("tooltip")).toBeNull();

    await user.tab();
    await user.tab();
    expect(within(screen.getByRole("tooltip")).getByText("Analytics")).toBeTruthy();
  });

  it("needs no tooltip while the labels are visible", async () => {
    const user = userEvent.setup();
    renderNav();

    await user.hover(screen.getByRole("link", { name: "Analytics" }));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("hides the labels from the eye, not from the reading order, only while collapsed", () => {
    const open = renderNav();
    expect(screen.getByText("Analytics").className).not.toContain("ds-sr");
    open.unmount();

    renderNav({ collapsed: true });
    expect(screen.getByText("Analytics").className).toContain("ds-sr");
  });

  it("keeps the tooltip of the focused link when the pointer passes over another and leaves", async () => {
    const user = userEvent.setup();
    renderNav({ collapsed: true });

    await user.tab();
    await user.tab();
    await user.hover(screen.getByRole("link", { name: "Speed Insights" }));
    expect(within(screen.getByRole("tooltip")).getByText("Speed Insights")).toBeTruthy();
    await user.unhover(screen.getByRole("link", { name: "Speed Insights" }));

    expect(within(screen.getByRole("tooltip")).getByText("Analytics")).toBeTruthy();
  });

  it("hides the tooltip when keyboard focus moves on", async () => {
    const user = userEvent.setup();
    renderNav({ collapsed: true });

    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not leave a tooltip behind after a mouse click", async () => {
    const user = userEvent.setup();
    renderNav({ collapsed: true });

    await user.click(screen.getByRole("link", { name: "Analytics" }));
    await user.unhover(screen.getByRole("link", { name: "Analytics" }));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
