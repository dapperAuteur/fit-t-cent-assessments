/**
 * Rise Wellness ecosystem callout: partner-vetted copy, the same in every WitUS app, per the
 * canonical recipe (gemini/witus/public/brand/footer-recipe.md, "Rise Wellness, canonical copy").
 *
 * Only the colors and the app-name token are swapped here. Everything inside the section is
 * verbatim: don't paraphrase the services list, don't trim the disclaimer, don't reorder.
 *
 * English-only by policy (as in Wanderlust): the disclaimer was vetted with the partner in English,
 * so it is not translated. `lang="en"` makes screen readers pronounce it as English on /es pages.
 * The "Mon–Sat" en dash is partner copy and is exempt from scripts/check-copy.mjs.
 */
export function RiseWellnessCallout() {
  const link =
    "inline-flex min-h-11 items-center rounded font-medium text-emerald-800 hover:underline focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current sm:min-h-7 dark:text-emerald-200";
  return (
    <section
      lang="en"
      aria-labelledby="rise-wellness-heading"
      className="mb-8 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm dark:border-emerald-800 dark:bg-emerald-950"
    >
      <header className="mb-3">
        <p className="text-[11px] font-semibold tracking-wide text-emerald-800 uppercase dark:text-emerald-200">
          Mental health support
        </p>
        <h2 id="rise-wellness-heading" className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Rise Wellness of Indiana
        </h2>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
          Independent mental health provider · Not affiliated with Fit T. Cent Assessments
        </p>
      </header>

      <p className="leading-relaxed text-slate-700 dark:text-slate-200">
        Rise Wellness of Indiana provides compassionate, personalized, holistic mental health
        care: evidence-based medicine, trauma-informed care, and a whole-person approach to help
        you heal, grow, and thrive in mind, body, and spirit.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300">Services</p>
          <ul className="space-y-0.5 text-xs text-slate-700 dark:text-slate-200">
            <li>ADHD testing &amp; management (in-person and from home)</li>
            <li>Anxiety &amp; depression</li>
            <li>Maternal mental health</li>
            <li>Medication management</li>
            <li>GeneSight® genetic testing</li>
            <li>Behavioral therapy &amp; coaching</li>
            <li>Routine lab testing</li>
          </ul>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-300">
            Visit or call
          </p>
          <address className="text-xs leading-relaxed text-slate-700 not-italic dark:text-slate-200">
            320 North Meridian Street
            <br />
            Indianapolis, IN 46204
            <br />
            Mon–Sat by appointment · Sun closed
          </address>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs">
            <a href="tel:+13179650299" className={link}>
              317-965-0299
            </a>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <a href="https://risewellnessofindiana.com" target="_blank" rel="noopener noreferrer" className={link}>
              risewellnessofindiana.com
              <span className="sr-only"> (opens in new tab)</span>
            </a>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <a
              href="https://www.centenarianos.com/safety#rise-wellness"
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              Full safety page
              <span className="sr-only"> on centenarianos.com (opens in new tab)</span>
            </a>
          </div>
        </div>
      </div>

      <blockquote className="mt-4 border-l-2 border-emerald-700/40 pl-3 text-xs text-slate-600 italic dark:border-emerald-300/40 dark:text-slate-300">
        &ldquo;At Rise Wellness, we believe everyone has the capacity to rise above challenges
        and live a fulfilling, healthy life. Our care is guided by the belief that healing is
        personal, holistic, and rooted in compassion.&rdquo;
        <span className="mt-1 block text-slate-600 not-italic dark:text-slate-300">Rise Wellness of Indiana</span>
      </blockquote>

      {/* NON-NEGOTIABLE DISCLAIMER, vetted with the partner. Edit ONLY the app name token.
          Don't paraphrase. Don't trim. Don't reorder. */}
      <p className="mt-4 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
        Rise Wellness of Indiana is an independent organization. They are not affiliated with,
        employed by, or endorsed by Fit T. Cent Assessments, CentenarianOS, B4C LLC, AwesomeWebStore.com, or
        Anthony McDonald. We are grateful for their collaboration on mental health safety
        resources for our community.
      </p>
    </section>
  );
}
