// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installFakeApi, removeFakeApi } from "@/test/fake-api";

import { Shell } from "./Shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next-auth/react", () => ({ signOut: () => undefined }));

afterEach(() => {
  cleanup();
  removeFakeApi();
  window.localStorage.clear();
});

const renderShell = () => {
  installFakeApi({ tenants: [], domains: [], current_visitors: [] });
  render(
    <Shell email="viewer@example.com">
      <p>page</p>
    </Shell>,
  );
};

describe("Shell", () => {
  it("offers the theme switcher beside the signed-in account", async () => {
    renderShell();

    const themes = await screen.findByRole("group", { name: "Theme" });

    expect(within(themes).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "System",
      "Light",
      "Dark",
      "High contrast",
    ]);
    expect(screen.getByText("viewer@example.com")).toBeTruthy();
  });
});
