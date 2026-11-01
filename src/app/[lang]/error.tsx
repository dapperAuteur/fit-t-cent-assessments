"use client";

import { useParams } from "next/navigation";
import { boundaryStrings } from "@/lib/i18n/boundary-strings";
import { cn, FOCUS_RING } from "@/lib/utils";

/** Route error boundary. Shows no error details: production messages are generic by design. */
export default function RouteError({ retry }: { error: unknown; retry: () => void }) {
  const params = useParams<{ lang: string }>();
  const t = boundaryStrings(params?.lang);
  return (
    <div role="alert" className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{t.error.title}</h1>
      <p className="mt-4 text-slate-700 dark:text-slate-300">{t.error.body}</p>
      <button
        type="button"
        onClick={() => retry()}
        className={cn(
          "mt-8 inline-flex min-h-12 items-center rounded-md bg-emerald-800 px-5 font-medium text-white hover:bg-emerald-900 dark:bg-emerald-300 dark:text-slate-950 dark:hover:bg-emerald-200",
          FOCUS_RING,
        )}
      >
        {t.error.retry}
      </button>
    </div>
  );
}
