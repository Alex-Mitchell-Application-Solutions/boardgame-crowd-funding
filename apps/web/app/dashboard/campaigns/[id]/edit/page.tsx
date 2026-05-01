import Link from 'next/link';
import { notFound } from 'next/navigation';
import { campaignCategory } from '@bgcf/db';
import { requireUser } from '@/server/auth';
import { getMyCampaign } from '@/server/campaigns/queries';
import { getCreatorProfile } from '@/server/creators/queries';
import {
  addRewardTier,
  publishCampaign,
  removeCampaignMedia,
  removeRewardTier,
  updateCampaign,
} from '@/server/campaigns/actions';
import { MediaUploader } from '@/components/campaigns/MediaUploader';
import { publicUrl } from '@/server/storage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit campaign' };

const STEPS = ['basics', 'story', 'tiers', 'media', 'review'] as const;
type Step = (typeof STEPS)[number];

export default async function EditCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step: rawStep } = await searchParams;
  const step: Step = STEPS.includes(rawStep as Step) ? (rawStep as Step) : 'basics';

  const user = await requireUser();
  const campaign = await getMyCampaign(id, user.id);
  if (!campaign) notFound();
  const profile = await getCreatorProfile(user.id);

  const updateBound = updateCampaign.bind(null, campaign.id);
  const publishBound = publishCampaign.bind(null, campaign.id);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <Link
          href="/dashboard/campaigns"
          className="text-xs font-medium text-slate-500 hover:underline"
        >
          ← All campaigns
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{campaign.title}</h1>
        <p className="text-sm text-slate-600">
          Status: <span className="font-medium">{campaign.status}</span> · slug{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{campaign.slug}</code>
        </p>
      </header>

      <nav className="flex gap-2 border-b border-slate-200 pb-2">
        {STEPS.map((s) => (
          <Link
            key={s}
            href={`/dashboard/campaigns/${campaign.id}/edit?step=${s}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              step === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {s}
          </Link>
        ))}
      </nav>

      {step === 'basics' ? (
        <BasicsStep campaign={campaign} action={updateBound} />
      ) : step === 'story' ? (
        <StoryStep campaign={campaign} action={updateBound} />
      ) : step === 'tiers' ? (
        <TiersStep campaign={campaign} />
      ) : step === 'media' ? (
        <MediaStep campaign={campaign} />
      ) : (
        <ReviewStep
          campaign={campaign}
          chargesEnabled={profile?.stripeChargesEnabled ?? false}
          publish={publishBound}
        />
      )}
    </main>
  );
}

// ----------------------------------------------------------------------------
// Step components — kept inline for v1 simplicity. Each is a Server Component
// rendering the relevant fields and binding to the appropriate Server Action.
// ----------------------------------------------------------------------------

function BasicsStep({
  campaign,
  action,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof getMyCampaign>>>;
  action: (formData: FormData) => Promise<void>;
}) {
  const isDraft = campaign.status === 'draft';
  return (
    <form action={action} className="space-y-4">
      <Field
        label="Title"
        name="title"
        defaultValue={campaign.title}
        required
        disabled={!isDraft}
      />
      <Field
        label="Tagline (optional)"
        name="tagline"
        defaultValue={campaign.tagline ?? ''}
        maxLength={200}
      />
      <SelectField
        label="Category"
        name="category"
        defaultValue={campaign.category}
        options={[...campaignCategory.enumValues]}
        disabled={!isDraft}
      />
      <Field
        label="Goal (in pence)"
        name="goalPence"
        type="number"
        min={100}
        defaultValue={String(campaign.goalPence)}
        disabled={!isDraft}
      />
      <Field
        label="Deadline"
        name="deadlineAt"
        type="datetime-local"
        defaultValue={campaign.deadlineAt ? toLocalInputValue(campaign.deadlineAt) : ''}
        disabled={!isDraft}
      />
      <SubmitRow disabled={!isDraft} note={!isDraft ? 'Locked once campaign is live.' : null} />
    </form>
  );
}

function StoryStep({
  campaign,
  action,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof getMyCampaign>>>;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          Story (markdown — supports headers, bold, lists, images)
        </span>
        <textarea
          name="storyMd"
          rows={16}
          maxLength={50_000}
          defaultValue={campaign.storyMd}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <span className="mt-1 block text-xs text-slate-500">
          Aim for at least 50 characters before publishing — this is what backers see.
        </span>
      </label>
      <SubmitRow disabled={false} />
    </form>
  );
}

function TiersStep({
  campaign,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof getMyCampaign>>>;
}) {
  const addBound = addRewardTier.bind(null, campaign.id);
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Reward tiers</h2>

      {campaign.rewardTiers.length > 0 ? (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {campaign.rewardTiers.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {t.title} · £{(t.pricePence / 100).toLocaleString('en-GB')}
                </p>
                <p className="text-xs text-slate-500">
                  {t.quantityLimit
                    ? `${t.quantityClaimed}/${t.quantityLimit} claimed`
                    : `${t.quantityClaimed} claimed (no cap)`}
                  {t.estimatedDelivery ? ` · est. delivery ${t.estimatedDelivery}` : ''}
                  {t.isHidden ? ' · hidden' : ''}
                </p>
              </div>
              <form action={removeRewardTier.bind(null, t.id)}>
                <button type="submit" className="text-xs font-medium text-red-700 hover:underline">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          No reward tiers yet. You need at least one before publishing.
        </p>
      )}

      <details className="rounded-md border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-medium">Add a reward tier</summary>
        <form action={addBound} className="mt-4 space-y-3">
          <Field label="Title" name="title" required maxLength={120} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Description (markdown)</span>
            <textarea
              name="descriptionMd"
              rows={4}
              maxLength={10_000}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </label>
          <Field label="Price (pence)" name="pricePence" type="number" min={100} required />
          <Field
            label="Quantity limit (optional, blank = unlimited)"
            name="quantityLimit"
            type="number"
            min={1}
          />
          <Field label="Estimated delivery (optional)" name="estimatedDelivery" type="date" />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Add tier
          </button>
        </form>
      </details>
    </div>
  );
}

function MediaStep({
  campaign,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof getMyCampaign>>>;
}) {
  const cover = campaign.media.find((m) => m.kind === 'cover');
  const gallery = campaign.media.filter((m) => m.kind !== 'cover');
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Cover image</h2>
        {cover ? (
          <MediaCard media={cover} />
        ) : (
          <p className="text-sm text-slate-600">No cover yet — required before publishing.</p>
        )}
        <MediaUploader
          campaignId={campaign.id}
          kind="cover"
          label={cover ? 'Replace cover image' : 'Upload cover image'}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Gallery</h2>
        {gallery.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((m) => (
              <li key={m.id}>
                <MediaCard media={m} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">No gallery items yet (optional).</p>
        )}
        <MediaUploader campaignId={campaign.id} kind="gallery_image" label="Add gallery image" />
      </section>
    </div>
  );
}

function MediaCard({
  media,
}: {
  media: NonNullable<Awaited<ReturnType<typeof getMyCampaign>>>['media'][number];
}) {
  const url = (() => {
    try {
      return publicUrl(media.r2Key);
    } catch {
      return null;
    }
  })();
  return (
    <div className="space-y-1">
      <div className="overflow-hidden rounded-md border border-slate-200">
        {url && media.mimeType.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-32 w-full object-cover" />
        ) : (
          <div className="flex h-32 items-center justify-center bg-slate-100 text-xs text-slate-500">
            {media.mimeType}
          </div>
        )}
      </div>
      <form action={removeCampaignMedia.bind(null, media.id)}>
        <button type="submit" className="text-xs font-medium text-red-700 hover:underline">
          Remove
        </button>
      </form>
    </div>
  );
}

function ReviewStep({
  campaign,
  chargesEnabled,
  publish,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof getMyCampaign>>>;
  chargesEnabled: boolean;
  publish: () => Promise<void>;
}) {
  const blockers: string[] = [];
  if (campaign.status !== 'draft') blockers.push(`Already ${campaign.status}.`);
  if (!chargesEnabled) blockers.push('Stripe Connect onboarding incomplete.');
  if (!campaign.deadlineAt) blockers.push('Deadline not set.');
  if (campaign.storyMd.trim().length < 50) blockers.push('Story is too short (need 50+ chars).');
  if (!campaign.media.some((m) => m.kind === 'cover')) blockers.push('No cover image.');
  if (campaign.rewardTiers.length === 0) blockers.push('No reward tiers.');

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Review &amp; publish</h2>
      {blockers.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Fix these before publishing:</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : (
        <form action={publish}>
          <button
            type="submit"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Publish campaign
          </button>
        </form>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tiny shared UI bits.
// ----------------------------------------------------------------------------

function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  required,
  disabled,
  min,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        min={min}
        maxLength={maxLength}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:bg-slate-100 disabled:text-slate-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function SubmitRow({ disabled, note }: { disabled: boolean; note?: string | null }) {
  return (
    <div className="flex items-center justify-between pt-2">
      <span className="text-xs text-slate-500">{note ?? ''}</span>
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
      >
        Save
      </button>
    </div>
  );
}

function toLocalInputValue(d: Date): string {
  // datetime-local expects "YYYY-MM-DDTHH:mm" without timezone suffix.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
