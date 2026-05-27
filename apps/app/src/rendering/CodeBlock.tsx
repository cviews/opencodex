import { useMemo } from 'react';
import hljs from 'highlight.js';
import { Copy, Check, FileCode2 } from 'lucide-react';
import { useState } from 'react';

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
  isStreaming?: boolean;
}

const LANG_ALIASES: Record<string, string> = {
  tsx: 'typescript',
  jsx: 'javascript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  md: 'markdown',
  rs: 'rust',
  yml: 'yaml',
};

function detectFilename(code: string, language: string): string | undefined {
  const firstLine = code.split('\n')[0]?.trim();
  if (!firstLine) return undefined;

  const pathMatch = firstLine.match(/^(?:\/\/|#|--)\s*(.+\.[a-zA-Z0-9]+)\s*$/);
  if (pathMatch) return pathMatch[1];

  if (language.includes('/') || language.includes('.')) {
    return language;
  }

  return undefined;
}

function resolveLanguage(lang: string): string {
  const normalized = lang.toLowerCase().split(':')[0];
  return LANG_ALIASES[normalized] ?? normalized;
}

export function CodeBlock({ code, language, isStreaming = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const filename = useMemo(() => detectFilename(code, language), [code, language]);
  const resolvedLang = useMemo(() => resolveLanguage(language), [language]);

  const highlighted = useMemo(() => {
    if (isStreaming) return null;
    try {
      if (hljs.getLanguage(resolvedLang)) {
        return hljs.highlight(code, { language: resolvedLang }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }, [code, resolvedLang, isStreaming]);

  const displayLang = filename ? filename.split('/').pop() ?? resolvedLang : resolvedLang;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="message-code-block my-3 overflow-hidden rounded-lg border border-[var(--color-msg-border)]">
      <div className="flex items-center justify-between border-b border-[var(--color-msg-border)] bg-[var(--color-msg-code-header)] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          {filename ? (
            <>
              <FileCode2 size={13} className="shrink-0 text-[var(--color-msg-muted)]" />
              <span className="truncate font-mono text-[12px] text-[var(--color-msg-text-secondary)]">
                {filename}
              </span>
            </>
          ) : (
            <span className="font-mono text-[12px] text-[var(--color-msg-muted)]">{displayLang}</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] text-[var(--color-msg-muted)] transition-colors hover:bg-[var(--color-msg-hover)] hover:text-[var(--color-msg-text)]"
        >
          {copied ? (
            <>
              <Check size={12} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="message-code-content overflow-x-auto bg-[var(--color-msg-code-bg)] px-4 py-3">
        <pre className="text-[13px] leading-[1.6]">
          {isStreaming || highlighted === null ? (
            <code className="font-mono whitespace-pre-wrap break-words text-[var(--color-msg-text)]">{code}</code>
          ) : (
            <code className="hljs font-mono" dangerouslySetInnerHTML={{ __html: highlighted }} />
          )}
        </pre>
      </div>
    </div>
  );
}
