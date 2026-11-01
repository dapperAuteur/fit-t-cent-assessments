import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { appUrl } from "@/lib/env";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, LOCALES } from "@/lib/i18n/locales";
import { cn, FOCUS_RING } from "@/lib/utils";
import "../globals.css";

/*
 * The root layout lives under [lang] so <html lang> is right on the first byte for both
 * languages (screen readers pick their voice from it). src/proxy.ts sends every locale-less
 * path here. Analytics is NOT mounted here: it lives in the (marketing) group's layout only,
 * so assessment, results and coach pages never load it (build plan section 1.9).
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    metadataBase: new URL(appUrl()),
    title: { default: dict.meta.title, template: `%s · ${dict.meta.title}` },
    description: dict.meta.description,
    alternates: {
      canonical: `/${lang}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      type: "website",
      siteName: dict.meta.title,
      title: dict.meta.title,
      description: dict.meta.description,
      locale: lang === "es" ? "es_US" : "en_US",
    },
    icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <html lang={lang}>
      <body className="flex min-h-dvh flex-col bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <a
          href="#main"
          className={cn(
            "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900 dark:focus:bg-slate-900 dark:focus:text-slate-50",
            FOCUS_RING,
          )}
        >
          {dict.common.skipToContent}
        </a>
        <SiteHeader lang={lang} dict={dict.common} />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter lang={lang} dict={dict.footer} />
      </body>
    </html>
  );
}
