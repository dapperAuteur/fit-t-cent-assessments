import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/locales";
import { cn, FOCUS_RING } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[lang]/adults-only">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return { title: dict.welcome.adultsOnlyTitle, robots: { index: false } };
}

/**
 * Where the welcome step's "No, I am under 18" answer lands (build plan 1.9): this app's session is
 * already ended and the account row it made is deleted (src/app/[lang]/welcome/actions.ts).
 */
export default async function AdultsOnlyPage({ params }: PageProps<"/[lang]/adults-only">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{dict.welcome.adultsOnlyTitle}</h1>
      <p className="text-slate-700 dark:text-slate-300">{dict.welcome.adultsOnlyBody}</p>
      <Link
        href={`/${lang}`}
        className={cn(
          "inline-flex min-h-11 items-center self-start rounded-md text-emerald-800 underline underline-offset-4 dark:text-emerald-200",
          FOCUS_RING,
        )}
      >
        {dict.common.backHome}
      </Link>
    </div>
  );
}
