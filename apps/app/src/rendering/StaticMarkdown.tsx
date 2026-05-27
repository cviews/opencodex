import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';
import { DiffBlock } from './DiffBlock';
import { getModelLabel } from '../thread/composer/models';

const FILE_CITATION_RE = /^(\d+):(\d+):(.+)$/;

function FileCitation({ path, startLine, endLine }: { path: string; startLine: string; endLine: string }) {
  const filename = path.split('/').pop() ?? path;
  const lineRange = startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded border border-[var(--color-msg-border)] bg-[var(--color-msg-surface)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--color-msg-accent)] transition-colors hover:bg-[var(--color-msg-hover)]"
      title={path}
    >
      <span className="opacity-70">{filename}</span>
      <span className="text-[var(--color-msg-muted)]">{lineRange}</span>
    </button>
  );
}

function extractCodeFromPre(children: ReactNode): { code: string; language: string } | null {
  if (!children) return null;
  const child = Array.isArray(children) ? children[0] : children;
  if (
    child &&
    typeof child === 'object' &&
    'props' in child &&
    child.props &&
    'children' in child.props
  ) {
    const className = (child.props as { className?: string }).className || '';
    const language = className.replace('language-', '');
    const code = String(child.props.children).replace(/\n$/, '');
    return { code, language };
  }
  return null;
}

function isDiffContent(code: string): boolean {
  const lines = code.split('\n');
  return (
    lines.some((line) => line.startsWith('--- ') || line.startsWith('+++ ')) &&
    lines.some((line) => line.startsWith('-') || line.startsWith('+'))
  );
}

interface StaticMarkdownProps {
  content: string;
}

export function StaticMarkdown({ content }: StaticMarkdownProps) {
  return (
    <div className="message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const codeElement = extractCodeFromPre(children);
            if (codeElement) {
              const codeString = codeElement.code.replace(/\n$/, '');
              const language = codeElement.language;
              if (language === 'diff' || isDiffContent(codeString)) {
                return <DiffBlock content={codeString} />;
              }
              return <CodeBlock code={codeString} language={language || 'text'} isStreaming={false} />;
            }
            return <pre>{children}</pre>;
          },
          code({ className, children, ...props }) {
            const isInline = !className;
            if (isInline) {
              const text = String(children);
              if (text.startsWith('model:')) {
                const parts = text.split(':');
                const label = parts[2] || parts[1];
                return (
                  <span className="inline-flex items-center gap-1 rounded-md border border-[rgba(14,165,233,0.25)] bg-[rgba(14,165,233,0.12)] px-1.5 py-0.5 text-xs font-medium text-[#0EA5E9] select-none">
                    {label}
                  </span>
                );
              }
              const citationMatch = FILE_CITATION_RE.exec(text);
              if (citationMatch) {
                const [, startLine, endLine, path] = citationMatch;
                return <FileCitation startLine={startLine} endLine={endLine} path={path} />;
              }
              return (
                <code
                  className="rounded px-1 py-0.5 font-mono text-[0.9em] bg-[var(--color-msg-inline-code-bg)] text-[var(--color-msg-text)]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="mb-3 last:mb-0 leading-[1.7] text-[var(--color-msg-text)]">{children}</p>;
          },
          h1({ children }) {
            return <h1 className="mb-3 mt-5 text-lg font-semibold text-[var(--color-msg-text)] first:mt-0">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="mb-2.5 mt-4 text-base font-semibold text-[var(--color-msg-text)] first:mt-0">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mb-2 mt-3 text-[15px] font-semibold text-[var(--color-msg-text)] first:mt-0">{children}</h3>;
          },
          ul({ children }) {
            return <ul className="my-2 list-disc space-y-1 pl-5 text-[var(--color-msg-text)]">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-2 list-decimal space-y-1 pl-5 text-[var(--color-msg-text)]">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-[1.7]">{children}</li>;
          },
          strong({ children }) {
            return <strong className="font-semibold text-[var(--color-msg-text)]">{children}</strong>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                className="text-[var(--color-msg-accent)] underline underline-offset-2 hover:opacity-80"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-3 border-l-2 border-[var(--color-msg-border)] pl-4 text-[var(--color-msg-muted)]">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-[var(--color-msg-border)]">
                <table className="w-full border-collapse text-[13px]">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border-b border-[var(--color-msg-border)] bg-[var(--color-msg-surface)] px-3 py-2 text-left font-medium text-[var(--color-msg-text)]">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border-b border-[var(--color-msg-border)] px-3 py-2 text-[var(--color-msg-text)]">
                {children}
              </td>
            );
          },
          hr() {
            return <hr className="my-5 border-none h-px bg-[var(--color-msg-border)]" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
