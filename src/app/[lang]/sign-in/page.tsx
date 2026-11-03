import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { DevSignInForm } from "@/components/auth/dev-sign-in-form";
import { WitusSignInButton } from "@/components/auth/witus-sign-in-button";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/locales";
import { devSignInEnabled, resolveWitusProvider } from "@/lib/runtime-env";
import { getSessionUser } from "@/lib/session";
import { cn, FOCUS_RING } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[lang]/sign-in">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return { title: dict.signIn.title, robots: { index: false } };
}

/**
 * Sign in with WitUS (build plan 1.8). Rendered per request, not at build time: which controls
 * show depends on the runtime environment (the provider appears once its client id and secret
 * are set; the development form only off Vercel).
 */
export default async function SignInPage({ params, searchParams }: PageProps<"/[lang]/sign-in">) {
  await connection();
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  if (await getSessionUser()) redirect(`/${lang}/welcome`);

  const dict = await getDictionary(lang);
  const { error } = await searchParams;
  const witus = resolveWitusProvider(process.env) !== null;
  const dev = devSignInEnabled(process.env);
  // The welcome step runs after every sign-in and sends a finished account straight home.
  const callbackURL = `/${lang}/welcome`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{dict.signIn.title}</h1>
      {error ? (
        <p role="alert" className="rounded-md border border-red-700 p-3 text-red-800 dark:border-red-300 dark:text-red-200">
          {dict.signIn.failed}
        </p>
      ) : null}
      {witus || dev ? (
        <p className="text-slate-700 dark:text-slate-300">{dict.signIn.intro}</p>
      ) : (
        <p role="status" className="text-slate-700 dark:text-slate-300">
          {dict.signIn.notReady}
        </p>
      )}
      {witus ? (
        <div className="flex flex-col gap-2">
          <WitusSignInButton
            callbackURL={callbackURL}
            labels={{
              button: dict.signIn.witusButton,
              redirecting: dict.signIn.redirecting,
              startFailed: dict.signIn.startFailed,
            }}
          />
          <p className="text-sm text-slate-700 dark:text-slate-300">{dict.signIn.witusHelp}</p>
        </div>
      ) : null}
      {dev ? (
        <DevSignInForm
          callbackURL={callbackURL}
          labels={{
            title: dict.signIn.devTitle,
            note: dict.signIn.devNote,
            email: dict.signIn.devEmailLabel,
            submit: dict.signIn.devSubmit,
            sending: dict.signIn.devSending,
            sent: dict.signIn.devSent,
            error: dict.signIn.devError,
          }}
        />
      ) : null}
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
