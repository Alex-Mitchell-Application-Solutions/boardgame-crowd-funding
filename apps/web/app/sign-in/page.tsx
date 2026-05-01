import { signInWithMagicLink } from './actions';

export const metadata = {
  title: 'Sign in',
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  return <SignInForm searchParams={searchParams} />;
}

async function SignInForm({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-24">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-slate-600">
          We&apos;ll email you a magic link — no password required.
        </p>
      </div>

      {sent === '1' ? (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Check your email for a sign-in link.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      <form action={signInWithMagicLink} className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            placeholder="you@example.com"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Send magic link
        </button>
      </form>
    </main>
  );
}
