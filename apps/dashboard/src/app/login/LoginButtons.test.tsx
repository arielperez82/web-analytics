// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const signIn = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({ signIn }));

import { LoginButtons } from "./LoginButtons";

afterEach(() => {
  cleanup();
  signIn.mockReset();
});

describe("LoginButtons", () => {
  it("returns the user to where they were after Google sign-in", async () => {
    render(<LoginButtons google dev={false} callbackUrl="/reports/pages?days=7" />);

    await userEvent.click(screen.getByText("Sign in with Google"));

    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/reports/pages?days=7" });
  });

  it("returns the user to where they were after dev sign-in", async () => {
    render(<LoginButtons google={false} dev callbackUrl="/speed?days=7" />);

    await userEvent.type(screen.getByPlaceholderText("dev login email"), "a@b.co");
    await userEvent.click(screen.getByText("Dev login"));

    expect(signIn).toHaveBeenCalledWith("dev-login", { email: "a@b.co", callbackUrl: "/speed?days=7" });
  });
});
