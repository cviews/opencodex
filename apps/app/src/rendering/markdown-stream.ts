import { marked, type Tokens } from 'marked';
import remend from 'remend';

export type MarkdownBlock = {
  raw: string;
  src: string;
  mode: 'full' | 'live';
};

function hasReferenceDefinitions(text: string) {
  return /^\[[^\]]+\]:\s+\S+/m.test(text) || /^\[\^[^\]]+\]:\s+/m.test(text);
}

function isCodeFenceOpen(raw: string) {
  const match = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (!match) return false;
  const mark = match[1];
  if (!mark) return false;
  const char = mark[0];
  const size = mark.length;
  const last = raw.trimEnd().split('\n').at(-1)?.trim() ?? '';
  return !new RegExp(`^[\\t ]{0,3}${char}{${size},}[\\t ]*$`).test(last);
}

function heal(text: string) {
  return remend(text, { linkMode: 'text-only' });
}

/** Split streaming text into rendered markdown + plain-text tail (Cursor-style). */
export function splitStreamingParts(
  text: string,
  live: boolean,
): { committed: string; tail: string } {
  if (!text) return { committed: '', tail: '' };
  if (!live) return { committed: text, tail: '' };

  const blocks = splitMarkdownStream(text, true);
  if (blocks.length === 2) {
    return { committed: blocks[0].raw, tail: blocks[1].raw };
  }

  const lines = text.split('\n');
  if (lines.length <= 1) {
    return { committed: '', tail: text };
  }

  const tail = lines[lines.length - 1] ?? '';
  const committed = lines.slice(0, -1).join('\n');
  return { committed, tail };
}

export function splitMarkdownStream(text: string, live: boolean): MarkdownBlock[] {
  if (!live) return [{ raw: text, src: text, mode: 'full' }];
  const src = heal(text);
  if (hasReferenceDefinitions(text)) {
    return [{ raw: text, src, mode: 'live' }];
  }

  const tokens = marked.lexer(text);
  let tail = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i]?.type !== 'space') {
      tail = i;
      break;
    }
  }
  if (tail < 0) return [{ raw: text, src, mode: 'live' }];

  const last = tokens[tail];
  if (!last || last.type !== 'code') return [{ raw: text, src, mode: 'live' }];

  const code = last as Tokens.Code;
  if (!isCodeFenceOpen(code.raw)) return [{ raw: text, src, mode: 'live' }];

  const head = tokens
    .slice(0, tail)
    .map((token) => token.raw)
    .join('');
  if (!head) return [{ raw: code.raw, src: code.raw, mode: 'live' }];

  return [
    { raw: head, src: heal(head), mode: 'live' },
    { raw: code.raw, src: code.raw, mode: 'live' },
  ];
}
