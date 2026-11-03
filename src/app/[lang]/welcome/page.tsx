import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/locales";
import { getSessionUser } from "@/lib/session";
import { cn, FOCUS_RING } from "@/lib/utils";
import { ROLE_CHOICES, welcomeStep } from "@/lib/welcome";
import { answerAge, chooseRole } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[lang]/welcome">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return { title: dict.welcome.title, robots: { index: false } };
}

const PRIMARY =
  "flex min-h-12 w-full items-center justify-center rounded-md bg-emerald-800 px-4 font-semibold text-white hover:bg-emerald-900 dark:bg-emerald-300 dark:text-slate-950 dark:hover:bg-emerald-200";
const SECONDARY =
  "flex min-h-12 w-full items-center justify-center rounded-md border border-slate-700 px-4 font-semibold text-slate-900 hover:bg-slate-100 dark:border-slate-300 dark:text-slate-50 dark:hover:bg-slate-900";

/**
 * First sign-in only (build plan 1.2, 1.9): "Are you 18 or older?", then a role. Every sign-in
 * lands here; an account that has answered both goes straight home.
 */
export default async function WelcomePage({ params, searchParams }: PageProps<"/[lang]/welcome">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const { done, error } = await searchParams;
  const me = await getSessionUser();

  if (!me) {
    if (done !== "adults-only") redirect(`/${lang}/sign-in`);
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{dict.welcome.adultsOnlyTitle}</h1>
        <p role="status" className="text-slate-700 dark:text-slate-300">
          {dict.welcome.adultsOnlyBody}
        </p>
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

  const step = welcomeStep(me);
  if (step === "done") redirect(`/${lang}`);

  if (step === "age") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{dict.welcome.ageTitle}</h1>
        <form action={answerAge.bind(null, lang)}>
          <fieldset className="flex flex-col gap-4" aria-describedby="age-help">
            <legend className="text-xl font-semibold text-slate-900 dark:text-slate-50">{dict.welcome.ageLegend}</legend>
            <p id="age-help" className="text-slate-700 dark:text-slate-300">
              {dict.welcome.ageHelp}
            </p>
            <button type="submit" name="adult" value="yes" className={cn(PRIMARY, FOCUS_RING)}>
              {dict.welcome.ageYes}
            </button>
            <button type="submit" name="adult" value="no" className={cn(SECONDARY, FOCUS_RING)}>
              {dict.welcome.ageNo}
            </button>
          </fieldset>
        </form>
      </div>
    );
  }

  const hasError = error === "role";
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{dict.welcome.roleTitle}</h1>
      <form action={chooseRole.bind(null, lang)} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3" aria-describedby={hasError ? "role-error" : undefined}>
          <legend className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-50">{dict.welcome.roleLegend}</legend>
          {ROLE_CHOICES.map((role) => (
            <label
              key={role}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-slate-400 px-4 text-slate-900 has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50 dark:border-slate-600 dark:text-slate-50 dark:has-[:checked]:border-emerald-300 dark:has-[:checked]:bg-emerald-950"
            >
              <input type="radio" name="role" value={role} required className="size-5 accent-emerald-700" />
              {dict.welcome.roles[role]}
            </label>
          ))}
          {hasError ? (
            <p id="role-error" role="alert" className="text-red-700 dark:text-red-300">
              {dict.welcome.roleError}
            </p>
          ) : null}
        </fieldset>
        <button type="submit" className={cn(PRIMARY, FOCUS_RING)}>
          {dict.welcome.roleSubmit}
        </button>
      </form>
    </div>
  );
}
