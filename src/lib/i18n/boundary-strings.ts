import en from "@/dictionaries/en.json";
import es from "@/dictionaries/es.json";
import { DEFAULT_LOCALE, hasLocale, type Locale } from "./locales";

/**
 * Strings for the route-state files (not-found, error, loading). Next passes those files no
 * `params`, so they read the locale with useParams() on the client and pick from this small map
 * instead of the server-only getDictionary().
 */
const STRINGS = {
  en: { notFound: en.notFound, error: en.error, loading: en.common.loading, backHome: en.common.backHome },
  es: { notFound: es.notFound, error: es.error, loading: es.common.loading, backHome: es.common.backHome },
} satisfies Record<Locale, unknown>;

export function boundaryStrings(lang: string | string[] | undefined) {
  const value = typeof lang === "string" && hasLocale(lang) ? lang : DEFAULT_LOCALE;
  return { lang: value, ...STRINGS[value] };
}
