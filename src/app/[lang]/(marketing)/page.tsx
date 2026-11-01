import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/locales";

/** Landing placeholder. The real landing page (demo clip, method link) is phase 7. */
export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const { home } = await getDictionary(lang);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="text-sm font-semibold tracking-wide text-emerald-800 uppercase dark:text-emerald-200">
        {home.eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance text-slate-900 sm:text-4xl dark:text-slate-50">
        {home.title}
      </h1>
      <p className="mt-4 text-lg text-slate-700 dark:text-slate-300">{home.lead}</p>

      <section aria-labelledby="first-heading" className="mt-10">
        <h2 id="first-heading" className="text-xl font-semibold text-slate-900 dark:text-slate-50">
          {home.firstTitle}
        </h2>
        <p className="mt-2 text-slate-700 dark:text-slate-300">{home.firstBody}</p>
      </section>

      <section aria-labelledby="later-heading" className="mt-8">
        <h2 id="later-heading" className="text-xl font-semibold text-slate-900 dark:text-slate-50">
          {home.laterTitle}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
          {home.later.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="privacy-heading" className="mt-8">
        <h2 id="privacy-heading" className="text-xl font-semibold text-slate-900 dark:text-slate-50">
          {home.privacyTitle}
        </h2>
        <p className="mt-2 text-slate-700 dark:text-slate-300">{home.privacyBody}</p>
      </section>

      <section
        aria-labelledby="notes-heading"
        className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 id="notes-heading" className="font-semibold text-slate-900 dark:text-slate-50">
          {home.notesTitle}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
          {home.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
