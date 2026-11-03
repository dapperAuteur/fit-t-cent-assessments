import { describe, expect, it, vi } from "vitest";
import { signOutDestination, signOutHere } from "./sign-out";

describe("Sign out (this app only)", () => {
  it("ends the session, then goes home in the visitor's language", async () => {
    const calls: string[] = [];
    await signOutHere({
      signOut: async () => {
        calls.push("signOut");
      },
      navigate: (url) => calls.push(`navigate ${url}`),
      lang: "es",
    });
    expect(calls).toEqual(["signOut", "navigate /es"]);
  });

  it("still navigates when the sign-out call fails", async () => {
    const navigate = vi.fn();
    await signOutHere({ signOut: () => Promise.reject(new Error("network")), navigate, lang: "en" });
    expect(navigate).toHaveBeenCalledWith("/en");
  });

  it("never navigates to the IdP, even if the server answers with an end-session URL", async () => {
    const navigate = vi.fn();
    await signOutHere({
      signOut: async () => ({ data: { url: "https://accounts.witus.online/api/idp/oauth2/endsession" } }),
      navigate,
      lang: "en",
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[0]).toBe("/en");
    expect(signOutDestination("en")).not.toMatch(/witus\.online/);
  });
});
