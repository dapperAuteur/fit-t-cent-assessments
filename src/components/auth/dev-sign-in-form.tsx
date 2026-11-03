"use client";

import { useId, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn, FOCUS_RING } from "@/lib/utils";

type Labels = {
  title: string;
  note: string;
  email: string;
  submit: string;
  sending: string;
  sent: string;
  error: string;
};

/**
 * Development sign-in: a magic link printed to the server console (src/lib/dev-magic-link.ts).
 * The sign-in page renders this only when `devSignInEnabled` is true, which is never on Vercel.
 */
export function DevSignInForm({ callbackURL, labels }: { callbackURL: string; labels: Labels }) {
  const inputId = useId();
  const noteId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-dashed border-slate-400 p-4 dark:border-slate-600"
      onSubmit={(event) => {
        event.preventDefault();
        setStatus("sending");
        authClient.signIn
          .magicLink({ email, name: email.split("@")[0] ?? email, callbackURL, newUserCallbackURL: callbackURL })
          .then((result) => setStatus(result.error ? "error" : "sent"))
          .catch(() => setStatus("error"));
      }}
    >
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">{labels.title}</h2>
      <p id={noteId} className="text-sm text-slate-700 dark:text-slate-300">
        {labels.note}
      </p>
      <label htmlFor={inputId} className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {labels.email}
      </label>
      <input
        id={inputId}
        type="email"
        required
        autoComplete="email"
        aria-describedby={noteId}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={cn(
          "min-h-11 rounded-md border border-slate-400 bg-white px-3 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50",
          FOCUS_RING,
        )}
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className={cn(
          "min-h-11 rounded-md border border-slate-900 px-4 font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-100 dark:text-slate-50",
          FOCUS_RING,
        )}
      >
        {status === "sending" ? labels.sending : labels.submit}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-slate-700 dark:text-slate-300">
        {status === "sent" ? labels.sent : ""}
      </p>
      {status === "error" ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {labels.error}
        </p>
      ) : null}
    </form>
  );
}
