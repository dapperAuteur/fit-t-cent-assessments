import { describe, expect, it } from "vitest";
import en from "./en.json";
import es from "./es.json";

/** Every leaf path in a dictionary, with array items counted by index. */
function leafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => leafPaths(item, `${prefix}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

function leafStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(leafStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(leafStrings);
  return typeof value === "string" ? [value] : [];
}

describe("dictionaries", () => {
  it("es has exactly the keys en has (every string lands in both locales)", () => {
    expect(leafPaths(es).sort()).toEqual(leafPaths(en).sort());
  });

  it("has no empty strings", () => {
    for (const dict of [en, es]) {
      for (const s of leafStrings(dict)) expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it("names the home page Sign in control exactly 'Sign in' in English (shared UI/UX/DX rule)", () => {
    expect(en.common.signIn).toBe("Sign in");
  });

  it("puts the {brand} token exactly once in each copyright line", () => {
    for (const dict of [en, es]) expect(dict.footer.copyright.split("{brand}")).toHaveLength(2);
  });

  it("carries the not-affiliated footer line in English verbatim", () => {
    expect(en.footer.notAffiliated).toBe("Not affiliated with or endorsed by NASM or Functional Movement Systems.");
  });
});
