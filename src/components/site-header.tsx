import Link from "next/link";
import { HeaderAuthControl } from "@/components/auth/header-auth-control";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { otherLocale, type Locale } from "@/lib/i18n/locales";
import { cn, FOCUS_RING } from "@/lib/utils";

/**
 * The one header on every page. The Sign in control is required by the shared UI/UX/DX rule
 * (accessible name exactly "Sign in" in English, never renamed, guarded by an @smoke e2e test).
 *
 * The control itself is HeaderAuthControl: "Sign in" while signed out or while the session is
 * loading, "Sign out" (this app only) once a session is known.
 */
export function SiteHeader({ lang, dict }: { lang: Locale; dict: Dictionary["common"] }) {
  const other = otherLocale(lang);
  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <Link
          href={`/${lang}`}
          className={cn("flex min-h-11 items-center text-base font-semibold text-slate-900 dark:text-slate-50", FOCUS_RING)}
        >
          {dict.brand}
        </Link>
        <nav aria-label={dict.mainNav} className="flex items-center gap-2 text-sm font-medium">
          <Link
            href={`/${other}`}
            hrefLang={other}
            lang={other}
            className={cn(
              "flex min-h-11 items-center rounded-md px-3 text-slate-700 hover:text-slate-900 hover:underline dark:text-slate-300 dark:hover:text-slate-50",
              FOCUS_RING,
            )}
          >
            {dict.languageNames[other]}
          </Link>
          <HeaderAuthControl
            lang={lang}
            labels={{ signIn: dict.signIn, signOut: dict.signOut, signingOut: dict.signingOut }}
          />
        </nav>
      </div>
    </header>
  );
}
