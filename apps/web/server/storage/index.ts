import 'server-only';
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from '../env';

// ============================================================================
// Storage layer — provider-agnostic S3-compatible client.
// ----------------------------------------------------------------------------
// Configured for Cloudflare R2 in production via env (STORAGE_ENDPOINT etc.),
// but any S3-compatible backend works (Backblaze B2, Tigris, MinIO for tests).
// The single concrete dependency is the AWS SDK v3, which speaks the S3 wire
// protocol — switching providers is a config change, not a code change.
//
// Public callers see four operations: presignUpload, publicUrl, deleteObject,
// and storageKeyFor (a deterministic key-builder so we don't have key-shape
// drift between Server Actions and the presign endpoint).
// ============================================================================

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const env = getEnv();
  if (
    !env.STORAGE_ENDPOINT ||
    !env.STORAGE_BUCKET ||
    !env.STORAGE_ACCESS_KEY_ID ||
    !env.STORAGE_SECRET_ACCESS_KEY
  ) {
    throw new Error(
      'Storage env not configured — see env.example for STORAGE_ENDPOINT, ' +
        'STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY.',
    );
  }
  cachedClient = new S3Client({
    region: env.STORAGE_REGION ?? 'auto',
    endpoint: env.STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
    },
    // R2 ignores region but the SDK still requires one; explicit forces
    // path-style addressing which avoids subtle hosted-style issues.
    forcePathStyle: true,
  });
  return cachedClient;
}

/**
 * Build the canonical storage key for a piece of campaign media. Putting the
 * creator user-id in the prefix means signed URLs can't be replayed against
 * another creator's namespace, and per-creator listing/cleanup is trivial.
 */
export function storageKeyFor(args: {
  creatorUserId: string;
  campaignId: string;
  kind: 'cover' | 'gallery_image' | 'gallery_video';
  filename: string;
}): string {
  const safeFilename = args.filename
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `creators/${args.creatorUserId}/campaigns/${args.campaignId}/${args.kind}/${crypto.randomUUID()}-${safeFilename}`;
}

export type PresignArgs = {
  key: string;
  contentType: string;
  contentLength: number;
  /** Seconds the URL stays valid; defaults to 5 minutes. */
  expiresIn?: number;
};

/**
 * Returns a one-shot signed PUT URL the client can upload directly to.
 * Content-Type and Content-Length are baked into the signature, so the
 * actual upload must match exactly — this gives us free server-side
 * enforcement of the limits the presign endpoint validated.
 */
export async function presignUpload(args: PresignArgs): Promise<string> {
  const env = getEnv();
  const command = new PutObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: args.expiresIn ?? 300,
  });
}

/**
 * Public URL for a stored object. Uses the CDN/public hostname env var so
 * the same key can be re-fronted by a custom domain (e.g. media.<domain>)
 * without code changes.
 */
export function publicUrl(key: string): string {
  const env = getEnv();
  if (!env.NEXT_PUBLIC_STORAGE_PUBLIC_URL) {
    throw new Error(
      'NEXT_PUBLIC_STORAGE_PUBLIC_URL not set — needed to generate public media URLs.',
    );
  }
  return `${env.NEXT_PUBLIC_STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

/**
 * Delete an object by key. Used when a campaign_media row is removed; the
 * caller is responsible for ordering (delete row first, then storage, so a
 * crash mid-cleanup leaves at most an orphan blob — which a periodic R2
 * cleanup job will eventually catch).
 */
export async function deleteObject(key: string): Promise<void> {
  const env = getEnv();
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: key,
    }),
  );
}
