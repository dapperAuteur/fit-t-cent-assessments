import { notFound } from "next/navigation";

/**
 * Unmatched paths under a valid locale (/en/anything) land here and render [lang]/not-found.tsx
 * inside the site layout, with the header, footer and the right language.
 *
 * There is deliberately no loading.tsx at the [lang] level: its Suspense boundary starts the
 * stream before notFound() runs, and the 404 then goes out as a 200 (a soft 404). Add loading
 * states on the routes that fetch data (results, phase 6), not here.
 */
export default function CatchAll(): never {
  notFound();
}
