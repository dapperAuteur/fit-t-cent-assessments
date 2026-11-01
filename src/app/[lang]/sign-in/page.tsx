import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/locales";
import { cn, FOCUS_RING } from "@/lib/utils";

/**
 * Placeholder so the header's Sign in link lands somewhere real. Phase 1b replaces the body with
 * the Sign in with WitUS button (Better Auth, provider `witus`).
 */
export async function generateMetadata({ params }: PageProps<"/[lang]/sign-in">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return { title: dict.signIn.title, robots: { index: false } };
}

export default async function SignInPage({ params }: PageProps<"/[lang]/sign-in">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{dict.signIn.title}</h1>
      <p role="status" className="mt-4 text-slate-700 dark:text-slate-300">
        {dict.signIn.body}
      </p>
      <Link
        href={`/${lang}`}
        className={cn(
          "mt-8 inline-flex min-h-11 items-center rounded-md text-emerald-800 underline underline-offset-4 dark:text-emerald-200",
          FOCUS_RING,
        )}
      >
        {dict.common.backHome}
      </Link>
    </div>
  );
}
