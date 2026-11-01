import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { ANALYSIS_ROUTES, analysisCsp, baseSecurityHeaders, siteCsp } from "./security-headers";

function directive(csp: string, name: string): string[] {
  const found = csp.split("; ").find((d) => d === name || d.startsWith(`${name} `));
  return found ? found.split(" ").slice(1) : [];
}

describe("site CSP", () => {
  it("keeps connect-src to this origin only", () => {
    expect(directive(siteCsp(false), "connect-src")).toEqual(["'self'"]);
  });

  it("allows WebAssembly for the MediaPipe runtime but not eval in production", () => {
    const scripts = directive(siteCsp(false), "script-src");
    expect(scripts).toContain("'wasm-unsafe-eval'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("blocks framing and plugins", () => {
    expect(directive(siteCsp(false), "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(siteCsp(false), "object-src")).toEqual(["'none'"]);
  });
});

describe("analysis CSP", () => {
  it("keeps connect-src on this origin, plus blob: and data: for decoded media", () => {
    expect(directive(analysisCsp(false), "connect-src")).toEqual(["'self'", "blob:", "data:"]);
  });

  it("lets the pose worker start from this origin or a blob URL", () => {
    expect(directive(analysisCsp(false), "worker-src")).toEqual(["'self'", "blob:"]);
  });
});

describe("security headers", () => {
  it("sends HSTS in production only", () => {
    expect(baseSecurityHeaders(false).some((h) => h.key === "Strict-Transport-Security")).toBe(true);
    expect(baseSecurityHeaders(true).some((h) => h.key === "Strict-Transport-Security")).toBe(false);
  });

  it("allows the camera on this origin only", () => {
    const policy = baseSecurityHeaders(false).find((h) => h.key === "Permissions-Policy");
    expect(policy?.value).toContain("camera=(self)");
    expect(policy?.value).toContain("microphone=()");
  });
});

describe("next.config headers()", () => {
  it("puts the analysis CSP after the site CSP so it wins on /[lang]/assess/*", async () => {
    const entries = (await nextConfig.headers?.()) ?? [];
    const analysisIndex = entries.findIndex((e) => e.source === ANALYSIS_ROUTES);
    const siteIndex = entries.findIndex((e) => e.source === "/:path*");
    expect(siteIndex).toBeGreaterThanOrEqual(0);
    expect(analysisIndex).toBeGreaterThan(siteIndex);
    const csp = entries[analysisIndex]?.headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toContain("connect-src 'self' blob: data:");
  });
});
