"use client";

import en from "@/dictionaries/en.json";
import "./globals.css";

/**
 * Last-resort boundary for a crash in the root layout (src/app/[lang]/layout.tsx), which is the
 * thing that renders the header and footer. It replaces that layout, so it renders its own minimal
 * shell: the app name, one h1, a link home and a Sign in link (witus docs/shared-ui-ux-dx.md,
 * "Error pages keep the app shell"). No params reach this file, so it uses the default locale.
 * Plain anchors on purpose: a full page load fetches the crashed layout again.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <header className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/en" className="inline-flex min-h-11 items-center font-semibold">
            {en.meta.title}
          </a>
        </header>
        <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-16 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight">{en.error.title}</h1>
          <p className="mt-4 text-slate-700 dark:text-slate-300">{en.error.body}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex min-h-12 items-center rounded-md bg-emerald-800 px-5 font-medium text-white hover:bg-emerald-900 dark:bg-emerald-300 dark:text-slate-950 dark:hover:bg-emerald-200"
            >
              {en.error.retry}
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/en" className="inline-flex min-h-11 items-center underline underline-offset-4">
              {en.common.backHome}
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/en/sign-in" className="inline-flex min-h-11 items-center underline underline-offset-4">
              {en.common.signIn}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
