"use client";

import { useParams } from "next/navigation";
import { boundaryStrings } from "@/lib/i18n/boundary-strings";

export default function Loading() {
  const params = useParams<{ lang: string }>();
  const t = boundaryStrings(params?.lang);
  return (
    <div role="status" className="mx-auto w-full max-w-3xl px-4 py-16 text-slate-600 sm:px-6 dark:text-slate-400">
      {t.loading}
    </div>
  );
}
