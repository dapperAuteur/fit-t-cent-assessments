import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Error pages keep the app shell (witus docs/shared-ui-ux-dx.md). not-found and error render
 * inside the [lang] layout (header + footer); global-error replaces that layout when it crashes, so
 * it must carry its own home and Sign in links and exactly one h1.
 */
const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf-8");

describe("error pages keep the app shell", () => {
  it("unmatched locale paths reach [lang]/not-found through the catch-all", () => {
    expect(read("src/app/[lang]/[...rest]/page.tsx")).toMatch(/notFound\(\)/);
  });

  it("global-error carries a home link, a Sign in link and one h1", () => {
    const src = read("src/app/global-error.tsx");
    expect(src).toMatch(/href="\/en"/);
    expect(src).toMatch(/href="\/en\/sign-in"/);
    expect(src).toContain("en.common.signIn");
    expect(src.match(/<h1/g)).toHaveLength(1);
  });
});
