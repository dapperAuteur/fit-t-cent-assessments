"use client";

import { useState } from "react";
import { signInWithWitus } from "@/lib/auth-client";
import { cn, FOCUS_RING } from "@/lib/utils";

/**
 * Starts Sign in with WitUS. Rendered only when the provider is configured (client id and secret
 * both set), so a visitor never sees a button that cannot finish.
 */
export function WitusSignInButton({
  callbackURL,
  labels,
}: {
  callbackURL: string;
  labels: { button: string; redirecting: string; startFailed: string };
}) {
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={state === "pending"}
        onClick={() => {
          setState("pending");
          signInWithWitus(callbackURL).catch(() => setState("failed"));
        }}
        className={cn(
          "flex min-h-12 w-full items-center justify-center rounded-md bg-emerald-800 px-4 font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 dark:bg-emerald-300 dark:text-slate-950 dark:hover:bg-emerald-200",
          FOCUS_RING,
        )}
      >
        {state === "pending" ? labels.redirecting : labels.button}
      </button>
      {state === "failed" ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {labels.startFailed}
        </p>
      ) : null}
    </div>
  );
}
