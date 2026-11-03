import { NextResponse, type NextRequest } from "next/server";

/**
 * Callback shim (the vogoat pattern). The WitUS IdP registers this app's redirect URI as
 * /api/auth/oauth2/callback/witus (`BETTER_AUTH_CB` in gemini/witus/lib/identity/clients.ts, exact
 * match), while Better Auth 1.7's genericOAuth handles the callback at the core
 * /api/auth/callback/:providerId. The IdP sends the browser here; this forwards code, state and any
 * error intact with a 307. Better Auth then redirects errors to /sign-in?error=... (auth.ts).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/auth/oauth2/callback/[providerId]">) {
  const { providerId } = await ctx.params;
  const url = new URL(`/api/auth/callback/${encodeURIComponent(providerId)}`, request.url);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 307);
}
