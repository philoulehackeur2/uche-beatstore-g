import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/whoami
 *
 * Diagnostic endpoint. Returns the server's view of the caller's auth state
 * so you can tell whether 401s from mutation routes are "I'm not signed in"
 * or "my session is good but a specific route is broken."
 *
 * Hit it from the browser:
 *   await fetch('/api/whoami').then(r => r.json())
 *
 * If `authenticated: false`, you need to sign in at /login. If it's `true`
 * but a different route still 401s, the bug is in that specific route.
 */
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      authenticated: false,
      reason: error?.message || 'No session cookie found on the request.',
      hint: 'Sign in at /login. If you already did and still see this, the auth cookie was not stored — check your browser cookie settings.',
    });
  }

  return NextResponse.json({
    authenticated: true,
    user: { id: user.id, email: user.email },
  });
}
