import { requireUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard',
};

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-sm text-slate-600">
        Signed in as <span className="font-medium">{user.email}</span>.
      </p>
      <p className="mt-6 text-sm text-slate-500">
        Creator onboarding, campaign creation, and the rest of the app land in M2 onward.
      </p>
    </main>
  );
}
