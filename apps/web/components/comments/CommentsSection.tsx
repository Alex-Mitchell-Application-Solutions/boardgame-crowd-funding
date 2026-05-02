import 'server-only';
import type { Comment } from '@bgcf/db';
import { postComment, deleteOwnComment, hideCommentAsCreator } from '@/server/comments/actions';

type Props = {
  campaignId: string;
  comments: Comment[];
  /** Currently signed-in viewer (null = anonymous). */
  viewerId: string | null;
  /** Whether the viewer is the campaign's creator (enables hide button). */
  viewerIsCreator: boolean;
  /** Whether new comments are accepted (campaign live or succeeded). */
  acceptingComments: boolean;
};

/**
 * Public comments section on `/c/[slug]`. One level of threading: replies
 * render under their parent. Hidden comments are filtered out by RLS, so
 * we don't need a client-side check.
 */
export function CommentsSection({
  campaignId,
  comments,
  viewerId,
  viewerIsCreator,
  acceptingComments,
}: Props) {
  const roots = comments.filter((c) => !c.parentId);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parentId) {
      const arr = repliesByParent.get(c.parentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentId, arr);
    }
  }

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">Comments</h2>

      {viewerId && acceptingComments ? (
        <CommentForm campaignId={campaignId} parentId={null} />
      ) : !acceptingComments ? (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          Comments are closed for this campaign.
        </p>
      ) : (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          <a className="font-medium underline" href="/sign-in">
            Sign in
          </a>{' '}
          to post a comment.
        </p>
      )}

      {roots.length === 0 ? (
        <p className="text-sm text-slate-500">No comments yet — be the first.</p>
      ) : (
        <ul className="space-y-4">
          {roots.map((c) => (
            <li key={c.id}>
              <CommentNode
                comment={c}
                replies={repliesByParent.get(c.id) ?? []}
                viewerId={viewerId}
                viewerIsCreator={viewerIsCreator}
                acceptingComments={acceptingComments}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentNode({
  comment,
  replies,
  viewerId,
  viewerIsCreator,
  acceptingComments,
}: {
  comment: Comment;
  replies: Comment[];
  viewerId: string | null;
  viewerIsCreator: boolean;
  acceptingComments: boolean;
}) {
  const isAuthor = viewerId && viewerId === comment.authorId;
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex items-baseline justify-between gap-3 text-xs text-slate-500">
        <span>
          <span className="font-medium text-slate-700">{shortIdLabel(comment.authorId)}</span>
          <span> · {formatRelative(comment.createdAt)}</span>
        </span>
        <span className="flex gap-3">
          {isAuthor ? (
            <form action={deleteOwnComment.bind(null, comment.id)}>
              <button type="submit" className="text-xs font-medium text-red-700 hover:underline">
                Delete
              </button>
            </form>
          ) : null}
          {viewerIsCreator && !isAuthor ? (
            <form action={hideCommentAsCreator.bind(null, comment.id)}>
              <button type="submit" className="text-xs font-medium text-amber-700 hover:underline">
                Hide
              </button>
            </form>
          ) : null}
        </span>
      </header>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{comment.body}</p>

      {replies.length > 0 ? (
        <ul className="mt-4 space-y-3 border-l-2 border-slate-200 pl-4">
          {replies.map((r) => (
            <li key={r.id}>
              <ReplyNode comment={r} viewerId={viewerId} viewerIsCreator={viewerIsCreator} />
            </li>
          ))}
        </ul>
      ) : null}

      {viewerId && acceptingComments && !comment.parentId ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">Reply</summary>
          <div className="mt-2">
            <CommentForm campaignId={comment.campaignId} parentId={comment.id} />
          </div>
        </details>
      ) : null}
    </article>
  );
}

function ReplyNode({
  comment,
  viewerId,
  viewerIsCreator,
}: {
  comment: Comment;
  viewerId: string | null;
  viewerIsCreator: boolean;
}) {
  const isAuthor = viewerId && viewerId === comment.authorId;
  return (
    <article>
      <header className="flex items-baseline justify-between gap-3 text-xs text-slate-500">
        <span>
          <span className="font-medium text-slate-700">{shortIdLabel(comment.authorId)}</span>
          <span> · {formatRelative(comment.createdAt)}</span>
        </span>
        <span className="flex gap-3">
          {isAuthor ? (
            <form action={deleteOwnComment.bind(null, comment.id)}>
              <button type="submit" className="text-xs font-medium text-red-700 hover:underline">
                Delete
              </button>
            </form>
          ) : null}
          {viewerIsCreator && !isAuthor ? (
            <form action={hideCommentAsCreator.bind(null, comment.id)}>
              <button type="submit" className="text-xs font-medium text-amber-700 hover:underline">
                Hide
              </button>
            </form>
          ) : null}
        </span>
      </header>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{comment.body}</p>
    </article>
  );
}

function CommentForm({ campaignId, parentId }: { campaignId: string; parentId: string | null }) {
  return (
    <form action={postComment} className="space-y-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <textarea
        name="body"
        required
        rows={3}
        maxLength={5000}
        placeholder={parentId ? 'Write a reply…' : 'Add a comment…'}
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          {parentId ? 'Reply' : 'Post comment'}
        </button>
      </div>
    </form>
  );
}

// auth.users isn't joined into the comments query — until we have proper
// public profiles, render a stable short identifier derived from the
// author's UUID. Privacy-preserving and good enough for v1.
function shortIdLabel(userId: string): string {
  return `User ${userId.slice(0, 8)}`;
}

function formatRelative(d: Date): string {
  const now = Date.now();
  const ms = now - d.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(d);
}
