import { useEffect, useRef, useState } from 'react';

const PACE_MS = 24;
const SNAP = /[\s.,!?;:)\]]/;

function step(size: number) {
  if (size <= 12) return 2;
  if (size <= 48) return 4;
  if (size <= 96) return 8;
  return Math.min(24, Math.ceil(size / 8));
}

function nextIndex(text: string, start: number) {
  const end = Math.min(text.length, start + step(text.length - start));
  const max = Math.min(text.length, end + 8);
  for (let i = end; i < max; i++) {
    if (SNAP.test(text[i] ?? '')) return i + 1;
  }
  return end;
}

export function usePacedValue(text: string, live: boolean): string {
  const [shown, setShown] = useState(text);
  const shownRef = useRef(text);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const clear = () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };

    const sync = (value: string) => {
      shownRef.current = value;
      setShown(value);
    };

    const run = () => {
      timeoutRef.current = undefined;
      if (!live) {
        sync(text);
        return;
      }
      if (!text.startsWith(shownRef.current) || text.length <= shownRef.current.length) {
        sync(text);
        return;
      }
      const end = nextIndex(text, shownRef.current.length);
      sync(text.slice(0, end));
      if (end < text.length) {
        timeoutRef.current = window.setTimeout(run, PACE_MS);
      }
    };

    clear();
    if (!live) {
      sync(text);
      return clear;
    }
    if (!text.startsWith(shownRef.current) || text.length < shownRef.current.length) {
      sync(text);
      return clear;
    }
    if (text.length === shownRef.current.length) {
      return clear;
    }
    if (timeoutRef.current === undefined) {
      timeoutRef.current = window.setTimeout(run, PACE_MS);
    }

    return clear;
  }, [text, live]);

  return shown;
}
