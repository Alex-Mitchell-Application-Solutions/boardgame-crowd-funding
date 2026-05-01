import 'server-only';
import type { MediaKind } from '@bgcf/db';

// Per-kind allow-lists and size caps. Enforced at presign time (we only
// sign URLs that match) and the Content-Length is baked into the signature
// so the actual upload also fails closed if the client sends more bytes.

export const MEDIA_LIMITS = {
  cover: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const,
    maxBytes: 5 * 1024 * 1024, // 5 MB
  },
  gallery_image: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const,
    maxBytes: 10 * 1024 * 1024, // 10 MB
  },
  gallery_video: {
    mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'] as const,
    maxBytes: 100 * 1024 * 1024, // 100 MB
  },
} satisfies Record<MediaKind, { mimeTypes: readonly string[]; maxBytes: number }>;

export type MediaLimitError =
  | { kind: 'unknown_kind' }
  | { kind: 'mime_not_allowed'; allowed: readonly string[] }
  | { kind: 'too_large'; maxBytes: number };

export function validateMediaUpload(args: {
  kind: string;
  mimeType: string;
  contentLength: number;
}): { ok: true; kind: MediaKind } | { ok: false; error: MediaLimitError } {
  if (!isMediaKind(args.kind)) {
    return { ok: false, error: { kind: 'unknown_kind' } };
  }
  const limits = MEDIA_LIMITS[args.kind];
  // `limits.mimeTypes` is a union of readonly tuples; widen to readonly
  // string[] so .includes() doesn't narrow the param to `never`.
  const allowed: readonly string[] = limits.mimeTypes;
  if (!allowed.includes(args.mimeType)) {
    return { ok: false, error: { kind: 'mime_not_allowed', allowed } };
  }
  if (args.contentLength > limits.maxBytes) {
    return { ok: false, error: { kind: 'too_large', maxBytes: limits.maxBytes } };
  }
  return { ok: true, kind: args.kind };
}

function isMediaKind(value: string): value is MediaKind {
  return value === 'cover' || value === 'gallery_image' || value === 'gallery_video';
}
