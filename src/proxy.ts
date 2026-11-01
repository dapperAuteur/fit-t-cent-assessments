import { NextResponse, type NextRequest } from "next/server";
import { localeRedirectTarget } from "@/lib/i18n/locales";

// Every page lives under /[lang]; without this the bare domain 404s. 307, not 308: "/" negotiates
// per Accept-Language, and a cached permanent redirect would pin a visitor to one language.
export function proxy(request: NextRequest) {
  const target = localeRedirectTarget(request.nextUrl.pathname, request.headers.get("accept-language"));
  if (!target) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // `ingest` is excluded here as well as in localeRedirectTarget: the proxy runs before rewrites,
  // so catching /ingest/e/ would redirect analytics into a 404.
  matcher: ["/((?!api|_next|ingest|.*\\..*).*)"],
};
