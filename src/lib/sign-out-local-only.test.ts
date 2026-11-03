import { readFileSync } from "node:fs";
import { join } from "node:path";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { genericOAuth } from "better-auth/plugins";
import { describe, expect, it } from "vitest";

// "Sign out" ends ONLY this app's session (build plan 1.8, `disableProviderLogout: true`).
// Copied from vogoat's tests/sign-out-local-only.test.ts, which caught the regression there.
//
// Better Auth 1.7 made RP-initiated logout the default for every genericOAuth provider: signOut()
// answers with the IdP's end_session_endpoint and the client follows it, which ends the shared
// WitUS session and strands the person on accounts.witus.online. Two halves:
//
//   1. THE CONFIG: src/lib/auth.ts keeps `disableProviderLogout: true` inside the witus provider.
//   2. THE BEHAVIOR against the installed Better Auth: a throwaway in-memory instance signs out a
//      user with a linked witus account; the response must clear the cookie and carry no
//      provider-logout URL. A control case WITHOUT the flag must produce the end-session URL, so a
//      library change that makes the first case pass vacuously fails here.

/** Assertions about what the CODE does must not be satisfied by a comment. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The object literal holding `providerId: "witus"`, from its opening to its closing brace. */
function witusProviderBlock(src: string): string {
  const start = src.indexOf('providerId: "witus"');
  if (start === -1) return "";
  const open = src.lastIndexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    if (src[i] === "}") depth -= 1;
    if (depth === 0) return src.slice(open, i + 1);
  }
  return "";
}

const BASE = "http://localhost:3070";

async function signOutOnce(disableProviderLogout: boolean) {
  const db = { user: [] as unknown[], session: [] as unknown[], account: [] as unknown[], verification: [] as unknown[] };
  const auth = betterAuth({
    baseURL: BASE,
    secret: "sign-out-local-only-test-secret-not-real",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
    telemetry: { enabled: false },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: "witus",
            authorizationUrl: "https://idp.invalid/authorize",
            tokenUrl: "https://idp.invalid/token",
            endSessionEndpoint: "https://idp.invalid/endsession",
            clientId: "test-client",
            clientSecret: "test-secret",
            ...(disableProviderLogout ? { disableProviderLogout: true } : {}),
          },
        ],
      }),
    ],
  });
  const { headers, response } = await auth.api.signUpEmail({
    body: { email: "person@example.invalid", password: "a-long-test-password", name: "Person" },
    returnHeaders: true,
  });
  const ctx = await auth.$context;
  await ctx.internalAdapter.createAccount({
    userId: response.user.id,
    providerId: "witus",
    accountId: "witus-sub-1",
    idToken: "header.payload.signature",
  });
  const cookie = (headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const res = await auth.handler(
    new Request(`${BASE}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie, origin: BASE, "content-type": "application/json" },
      body: "{}",
    }),
  );
  return {
    cookie,
    status: res.status,
    location: res.headers.get("location"),
    setCookie: res.headers.get("set-cookie") ?? "",
    body: (await res.json()) as { success?: boolean; url?: string; redirect?: boolean },
    sessionsLeft: db.session.length,
  };
}

describe('"Sign out" never hands off to the WitUS IdP', () => {
  it("src/lib/auth.ts sets disableProviderLogout: true on the witus provider", () => {
    const src = stripComments(readFileSync(join(process.cwd(), "src/lib/auth.ts"), "utf-8"));
    const block = witusProviderBlock(src);
    expect(block, "no witus provider block found").not.toBe("");
    expect(block).toMatch(/\bdisableProviderLogout:\s*true\b/);
  });

  it("src/lib/auth.ts pins the redirect URI to the path the IdP registers", () => {
    const src = stripComments(readFileSync(join(process.cwd(), "src/lib/auth.ts"), "utf-8"));
    expect(witusProviderBlock(src)).toMatch(/redirectURI:\s*`\$\{baseURL\}\$\{WITUS_CALLBACK_PATH\}`/);
  });

  it("with the flag, sign-out clears the session cookie and returns no provider-logout URL", async () => {
    const r = await signOutOnce(true);
    expect(r.cookie).toMatch(/^better-auth\.session_token=/);
    expect(r.status).toBe(200);
    expect(r.setCookie).toMatch(/better-auth\.session_token=;[^,]*Max-Age=0/);
    expect(r.sessionsLeft).toBe(0);
    expect(r.location).toBeNull();
    expect(r.body.url).toBeUndefined();
    expect(r.body.redirect).toBeFalsy();
  });

  it("control: without the flag, Better Auth 1.7 returns the IdP end-session URL", async () => {
    const r = await signOutOnce(false);
    expect(r.body.url).toMatch(/^https:\/\/idp\.invalid\/endsession/);
  });
});
