import { getAuth } from "@/lib/auth";

// getAuth() awaits the database (embedded PGlite applies migrations on first use locally), then
// Better Auth handles the request.
async function handler(request: Request): Promise<Response> {
  const auth = await getAuth();
  return auth.handler(request);
}

export { handler as GET, handler as POST };
