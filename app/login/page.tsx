import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  timingSafeEqual,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  async function signIn(formData: FormData) {
    'use server';

    const password = String(formData.get('password') ?? '');
    const expected = process.env.APP_PASSWORD;
    const secret = process.env.SESSION_SECRET;

    if (!expected || !secret) {
      throw new Error('APP_PASSWORD and SESSION_SECRET must be configured.');
    }

    const nextPath = String(formData.get('next') ?? '/');

    if (!timingSafeEqual(password, expected)) {
      // Bounce back with a flag rather than echoing the attempt anywhere.
      redirect(`/login?error=1${nextPath !== '/' ? `&next=${encodeURIComponent(nextPath)}` : ''}`);
    }

    cookies().set(SESSION_COOKIE, await createSessionToken(secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });

    // Only ever redirect to a relative path, so `next` cannot bounce a user
    // to an external site.
    redirect(nextPath.startsWith('/') ? nextPath : '/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        action={signIn}
        className="w-full max-w-[360px] rounded-card border border-card-border bg-card px-7 py-8"
      >
        <div className="text-acct font-bold">Editor Performance</div>
        <p className="mt-1 text-stat text-muted">Enter the shared password to continue.</p>

        <input type="hidden" name="next" value={searchParams.next ?? '/'} />

        <input
          type="password"
          name="password"
          autoFocus
          required
          aria-label="Password"
          className="mt-5 w-full rounded-tile border border-card-border bg-canvas px-3 py-[10px] text-sm+ outline-none focus:border-badge-target-fg"
        />

        {searchParams.error && (
          <p className="mt-2 text-xs+ text-negative">Incorrect password.</p>
        )}

        <button
          type="submit"
          className="mt-4 w-full rounded-tile bg-ink px-3 py-[10px] text-sm+ font-semibold text-white"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
