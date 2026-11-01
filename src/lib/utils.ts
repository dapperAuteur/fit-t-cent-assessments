import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins conditional Tailwind classes and resolves conflicts (shared UI/UX/DX rule 3). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** The shared focus ring, verbatim from the ecosystem standard. */
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";
