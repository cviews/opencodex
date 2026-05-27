import { useEffect, useId, useRef } from 'react';

type EscapeEntry = { id: string; handler: () => void };

const escapeStack: EscapeEntry[] = [];
let listenerAttached = false;

function handleGlobalEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  const top = escapeStack[escapeStack.length - 1];
  if (!top) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  top.handler();
}

function attachListener() {
  if (!listenerAttached) {
    window.addEventListener('keydown', handleGlobalEscape, true);
    listenerAttached = true;
  }
}

function detachListener() {
  if (listenerAttached && escapeStack.length === 0) {
    window.removeEventListener('keydown', handleGlobalEscape, true);
    listenerAttached = false;
  }
}

/** Register ESC to close — only the topmost enabled modal closes (stack order). */
export function useEscapeKey(handler: () => void, enabled: boolean = true) {
  const id = useId();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const entry: EscapeEntry = {
      id,
      handler: () => handlerRef.current(),
    };
    escapeStack.push(entry);
    attachListener();

    return () => {
      const idx = escapeStack.findIndex((e) => e.id === id);
      if (idx !== -1) escapeStack.splice(idx, 1);
      detachListener();
    };
  }, [enabled, id]);
}
