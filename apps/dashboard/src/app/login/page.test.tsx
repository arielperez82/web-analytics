// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const loginButtons = vi.hoisted(() => vi.fn(() => null));

vi.mock("./LoginButtons", () => ({ LoginButtons: loginButtons }));

import LoginPage from "./page";

afterEach(() => {
  cleanup();
  loginButtons.mockClear();
});

const shownWith = async (callbackUrl: string | string[] | undefined): Promise<unknown> => {
  const page = (await LoginPage({
    searchParams: Promise.resolve(callbackUrl === undefined ? {} : { callbackUrl }),
  })) as ReactElement;
  render(page);
  const [props] = loginButtons.mock.calls[0] as unknown as [{ callbackUrl: string }];
  return props.callbackUrl;
};

describe("LoginPage", () => {
  it("passes a safe return address through", async () => {
    expect(await shownWith("/reports/pages?days=7")).toBe("/reports/pages?days=7");
  });

  it("falls back to the root for an unsafe address", async () => {
    expect(await shownWith("https://evil.example/")).toBe("/");
  });

  it("falls back to the root when the address is missing", async () => {
    expect(await shownWith(undefined)).toBe("/");
  });

  it("falls back to the root when the address is repeated", async () => {
    expect(await shownWith(["/speed", "/reports/pages"])).toBe("/");
  });
});
