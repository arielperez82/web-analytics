// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeSwitcher } from "./ThemeSwitcher";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("ThemeSwitcher", () => {
  it("is a named group offering system, light, dark and high contrast", () => {
    render(<ThemeSwitcher />);

    const group = screen.getByRole("group", { name: "Theme" });

    expect(group).toBeTruthy();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "System",
      "Light",
      "Dark",
      "High contrast",
    ]);
  });

  it("starts on system", () => {
    render(<ThemeSwitcher />);

    expect(pressed("System")).toBe("true");
    expect(pressed("Dark")).toBe("false");
  });

  it("applies and marks the theme that is clicked", () => {
    render(<ThemeSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: "High contrast" }));

    expect(pressed("High contrast")).toBe("true");
    expect(pressed("System")).toBe("false");
    expect(document.documentElement.getAttribute("data-theme")).toBe("contrast");
  });

  it("marks the saved theme once it has read it", () => {
    window.localStorage.setItem("theme", "dark");

    render(<ThemeSwitcher />);

    expect(pressed("Dark")).toBe("true");
  });
});
