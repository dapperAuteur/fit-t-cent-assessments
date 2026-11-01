"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { boundaryStrings } from "@/lib/i18n/boundary-strings";
import { cn, FOCUS_RING } from "@/lib/utils";

export default function NotFound() {
  const params = useParams<{ lang: string }>();
  const t = boundaryStrings(params?.lang);
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{t.notFound.title}</h1>
      <p className="mt-4 text-slate-700 dark:text-slate-300">{t.notFound.body}</p>
      <Link
        href={`/${t.lang}`}
        className={cn(
          "mt-8 inline-flex min-h-11 items-center rounded-md text-emerald-800 underline underline-offset-4 dark:text-emerald-200",
          FOCUS_RING,
        )}
      >
        {t.backHome}
      </Link>
    </div>
  );
}
