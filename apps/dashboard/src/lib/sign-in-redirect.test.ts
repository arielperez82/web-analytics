import { describe, expect, it } from "vitest";

import { returnPath } from "./return-path";
import { redirectToSignIn, signInUrl } from "./sign-in-redirect";

describe("signInUrl", () => {
  it("carries the current path and query as the encoded return address", () => {
    expect(signInUrl("/reports/pages", "?date_from=2026-01-01&compare=previous_period")).toBe(
      "/login?callbackUrl=%2Freports%2Fpages%3Fdate_from%3D2026-01-01%26compare%3Dprevious_period",
    );
  });

  it("round-trips through the return-path validator", () => {
    const url = new URL(signInUrl("/", "?tenant_id=a&route=%2Fpricing"), "http://x");
    expect(returnPath(url.searchParams.get("callbackUrl"))).toBe("/?tenant_id=a&route=%2Fpricing");
  });
});

describe("redirectToSignIn", () => {
  it("sends the browser to sign in for a 401", () => {
    const sent: string[] = [];
    const redirected = redirectToSignIn(401, {
      pathname: "/speed",
      search: "?days=7",
      assign: (url) => sent.push(url),
    });
    expect(redirected).toBe(true);
    expect(sent).toEqual(["/login?callbackUrl=%2Fspeed%3Fdays%3D7"]);
  });

  it.each([200, 400, 403, 404, 502, undefined])("leaves status %s alone", (status) => {
    const sent: string[] = [];
    const redirected = redirectToSignIn(status, {
      pathname: "/",
      search: "",
      assign: (url) => sent.push(url),
    });
    expect(redirected).toBe(false);
    expect(sent).toEqual([]);
  });
});
