'use client';

import { useRef, useState, useTransition } from 'react';
import { addCampaignMedia } from '@/server/campaigns/actions';
import type { MediaKind } from '@bgcf/db';

type Props = {
  campaignId: string;
  kind: MediaKind;
  /** Human label for the dropzone, e.g. "Cover image" or "Add gallery image". */
  label: string;
};

/**
 * Two-step upload: presign → PUT to R2 → record on the server.
 * Direct-to-storage upload bypasses the Next.js server entirely on the
 * actual bytes, so multi-MB images don't tie up our app process. Content-
 * Type and Content-Length are baked into the signed URL by the presign
 * route; mismatches cause R2 to reject the PUT.
 */
export function MediaUploader({ campaignId, kind, label }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setProgress('Requesting upload URL…');

    try {
      const presignRes = await fetch('/api/storage/presign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          kind,
          filename: file.name,
          mimeType: file.type,
          contentLength: file.size,
        }),
      });
      if (!presignRes.ok) {
        const body = (await presignRes.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(`Could not sign upload: ${describeError(body.error)}`);
      }
      const { uploadUrl, storageKey } = (await presignRes.json()) as {
        uploadUrl: string;
        storageKey: string;
      };

      setProgress('Uploading…');
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload to storage failed (${putRes.status})`);
      }

      setProgress('Saving…');
      const formData = new FormData();
      formData.set('campaignId', campaignId);
      formData.set('storageKey', storageKey);
      formData.set('kind', kind);
      formData.set('mimeType', file.type);
      formData.set('bytes', String(file.size));

      startTransition(async () => {
        await addCampaignMedia(formData);
        setProgress(null);
        if (inputRef.current) inputRef.current.value = '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600 hover:border-slate-400">
        <span>{pending || progress ? (progress ?? 'Working…') : label}</span>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={onFileChange}
          disabled={pending || progress !== null}
          accept={kind === 'gallery_video' ? 'video/mp4,video/webm,video/quicktime' : 'image/*'}
        />
      </label>
      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describeError(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'kind' in err) {
    const k = (err as { kind: string }).kind;
    if (k === 'too_large') return 'file is too large for this kind';
    if (k === 'mime_not_allowed') return 'file type not allowed for this kind';
    if (k === 'unknown_kind') return 'unknown media kind';
  }
  return 'unknown error';
}
