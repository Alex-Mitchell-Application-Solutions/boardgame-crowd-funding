import Link from 'next/link';

export default function MarketingHome() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-24">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
        Crowdfunding for tabletop creators
      </p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Lower fees. More for the makers.
      </h1>
      <p className="text-lg text-slate-600">
        A focused crowdfunding platform built for indie boardgame designers. We charge a flat 3%
        platform fee plus payment processing — meaningfully less than the 5% the incumbents take —
        so more of every pledge goes to the people building the games.
      </p>
      <div className="flex gap-3 pt-4">
        <Link
          href="/sign-in"
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Sign in
        </Link>
        <Link
          href="/how-it-works"
          className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          How it works
        </Link>
      </div>
    </main>
  );
}
