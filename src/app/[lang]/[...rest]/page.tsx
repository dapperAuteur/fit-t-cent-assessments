import { notFound } from "next/navigation";

/**
 * Unmatched paths under a valid locale (/en/anything) land here and render [lang]/not-found.tsx
 * inside the site layout, with the header, footer and the right language.
 */
export default function CatchAll(): never {
  notFound();
}
