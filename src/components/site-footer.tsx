import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";
import { cn, FOCUS_RING } from "@/lib/utils";
import { RiseWellnessCallout } from "./rise-wellness-callout";

// Ecosystem footer per the canonical recipe (gemini/witus/public/brand/footer-recipe.md): same
// structure everywhere, this app's palette. Product names are proper nouns and stay untranslated.
// Differences from the recipe, on purpose: the copyright line drops its em dash (the shared copy
// rule bans dashes), and nav labels come from the locale dictionaries.

interface SiblingProduct {
  name: string;
  href: string;
}

// Canonical sibling-product list. Mirror with gemini/witus/lib/products.ts and the recipe.
const SIBLING_PRODUCTS: SiblingProduct[] = [
  { name: "WitUS.online", href: "https://witus.online" },
  { name: "WitUS Inbox", href: "https://inbox.witus.online" },
  { name: "CentenarianOS", href: "https://centenarianos.com" },
  { name: "Work.WitUS", href: "https://work.witus.online" },
  { name: "Tour Manager OS", href: "https://tour.witus.online" },
  { name: "Wanderlust", href: "https://wanderlust.witus.online" },
  { name: "Fly.WitUS", href: "https://fly.witus.online" },
  { name: "FlashLearnAI", href: "https://flashlearnai.witus.online" },
  { name: "Learn.WitUS", href: "https://learn.witus.online" },
  { name: "AwesomeWebStore", href: "https://awesomewebstore.com" },
];

const linkClasses = cn(
  "inline-flex min-h-11 items-center rounded text-slate-700 hover:text-emerald-800 hover:underline sm:min-h-7 dark:text-slate-300 dark:hover:text-emerald-200",
  FOCUS_RING,
);

export function SiteFooter({ lang, dict }: { lang: Locale; dict: Dictionary["footer"] }) {
  const year = new Date().getFullYear();
  // The brand link sits mid-sentence, in a different place per language.
  const [copyrightBefore = "", copyrightAfter = ""] = dict.copyright.split("{brand}");

  return (
    <footer className="mt-12 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-col items-center text-center">
          <p className="font-semibold text-slate-900 dark:text-slate-50">{dict.thisApp}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{dict.tagline}</p>
        </div>

        <RiseWellnessCallout />

        <div className="grid grid-cols-1 gap-8 text-sm sm:grid-cols-3">
          <div>
            <h2 className="mb-2 font-semibold text-slate-900 dark:text-slate-50">{dict.ecosystem}</h2>
            <ul className="space-y-1">
              {SIBLING_PRODUCTS.map((p) => (
                <li key={p.href}>
                  <a href={p.href} target="_blank" rel="noopener noreferrer" className={linkClasses}>
                    {p.name}
                    <span className="sr-only"> {dict.opensInNewTab}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-slate-900 dark:text-slate-50">{dict.thisApp}</h2>
            <ul className="space-y-1">
              <li>
                <Link href={`/${lang}`} className={linkClasses}>
                  {dict.home}
                </Link>
              </li>
              <li>
                <Link href={`/${lang}/sign-in`} className={linkClasses}>
                  {dict.signIn}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-slate-900 dark:text-slate-50">{dict.partnersLegal}</h2>
            <ul className="space-y-1">
              <li>
                <a
                  href="https://www.centenarianos.com/safety#rise-wellness"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClasses}
                >
                  {dict.riseWellness}
                  <span className="sr-only"> {dict.riseWellnessNewTab}</span>
                </a>
                <p className="text-xs leading-tight text-slate-600 dark:text-slate-400">{dict.riseWellnessSubtitle}</p>
              </li>
              {/* The app's own /privacy and /terms arrive in phase 7; until then the WitUS ones apply. */}
              <li className="pt-2">
                <a href="https://witus.online/terms" target="_blank" rel="noopener noreferrer" className={linkClasses}>
                  {dict.terms}
                  <span className="sr-only"> {dict.opensInNewTab}</span>
                </a>
              </li>
              <li>
                <a href="https://witus.online/privacy" target="_blank" rel="noopener noreferrer" className={linkClasses}>
                  {dict.privacy}
                  <span className="sr-only"> {dict.opensInNewTab}</span>
                </a>
              </li>
              <li>
                <a href="mailto:bam@awews.com" className={linkClasses}>
                  {dict.contact}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 space-y-2 border-t border-slate-200 pt-6 text-center text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <p>{dict.notAffiliated}</p>
          <p>
            © {year} {copyrightBefore}
            <a
              href="https://awesomewebstore.com"
              target="_blank"
              rel="noopener noreferrer"
              className={cn("underline-offset-2 hover:underline", FOCUS_RING)}
            >
              AwesomeWebStore.com
              <span className="sr-only"> {dict.opensInNewTab}</span>
            </a>
            {copyrightAfter}
          </p>
        </div>
      </div>
    </footer>
  );
}
