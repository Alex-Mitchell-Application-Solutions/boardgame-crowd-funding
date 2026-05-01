import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  source: string;
};

/**
 * Renders user-supplied markdown safely. react-markdown disallows raw HTML
 * by default and renders to React elements (no `dangerouslySetInnerHTML`),
 * so XSS via embedded <script> / <iframe> isn't a concern. remark-gfm adds
 * tables, strikethrough, task-lists, and autolinks — common in
 * crowdfunding stories.
 *
 * Anchor links are forced to open in a new tab with `noreferrer` so a
 * malicious link in someone's story can't capture the campaign-page
 * window via window.opener.
 */
export function MarkdownContent({ source }: Props) {
  return (
    <div className="prose prose-slate prose-headings:font-semibold prose-img:rounded-md max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
