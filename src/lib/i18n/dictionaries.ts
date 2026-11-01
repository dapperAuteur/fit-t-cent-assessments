import "server-only";
import type { Locale } from "./locales";

// en.json is the source of truth; the Dictionary type is inferred from it, and a unit test
// (src/dictionaries/dictionaries.test.ts) fails when es.json is missing a key. Spanish is drafted
// by Claude and checked by a fluent reviewer before each release (BAM, 2026-11-01, plan 01 answer 7).
export type Dictionary = typeof import("@/dictionaries/en.json");

const loaders = {
  en: () => import("@/dictionaries/en.json").then((m) => m.default),
  es: () => import("@/dictionaries/es.json").then((m) => m.default),
} satisfies Record<Locale, () => Promise<Dictionary>>;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return loaders[locale]();
}
