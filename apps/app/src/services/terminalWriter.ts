const MAX_PENDING_CHARS = 512_000;
const MAX_BATCH_CHARS = 32_768;

export function terminalWriter(
  write: (data: string, done?: VoidFunction) => void,
  schedule: (flush: VoidFunction) => void = queueMicrotask,
) {
  let chunks: string[] | undefined;
  let waits: VoidFunction[] | undefined;
  let scheduled = false;
  let writing = false;
  let pendingChars = 0;
  let droppedNotice = false;

  const settle = () => {
    if (scheduled || writing || chunks?.length) return;
    const list = waits;
    if (!list?.length) return;
    waits = undefined;
    for (const fn of list) {
      fn();
    }
  };

  const trimOverflow = () => {
    if (pendingChars <= MAX_PENDING_CHARS || !chunks?.length) return;
    let joined = chunks.join('');
    joined = joined.slice(-MAX_PENDING_CHARS);
    chunks = [joined];
    pendingChars = joined.length;
    if (!droppedNotice) {
      droppedNotice = true;
      chunks.unshift('\r\n\x1b[33m[terminal output truncated to keep input responsive]\x1b[0m\r\n');
      pendingChars += 80;
    }
  };

  const run = () => {
    if (writing) return;
    scheduled = false;
    const items = chunks;
    if (!items?.length) {
      settle();
      return;
    }
    chunks = undefined;
    writing = true;
    const joined = items.join('');
    pendingChars = Math.max(0, pendingChars - joined.length);
    const batch =
      joined.length > MAX_BATCH_CHARS ? joined.slice(0, MAX_BATCH_CHARS) : joined;
    const remainder =
      joined.length > MAX_BATCH_CHARS ? joined.slice(MAX_BATCH_CHARS) : undefined;
    if (remainder) {
      chunks = [remainder];
      pendingChars += remainder.length;
    }
    write(batch, () => {
      writing = false;
      if (chunks?.length) {
        if (scheduled) return;
        scheduled = true;
        schedule(run);
        return;
      }
      settle();
    });
  };

  const push = (data: string) => {
    if (!data) return;
    pendingChars += data.length;
    if (chunks) chunks.push(data);
    else chunks = [data];
    trimOverflow();

    if (scheduled || writing) return;
    scheduled = true;
    schedule(run);
  };

  const flush = (done?: VoidFunction) => {
    if (!scheduled && !writing && !chunks?.length) {
      done?.();
      return;
    }
    if (done) {
      if (waits) waits.push(done);
      else waits = [done];
    }
    run();
  };

  return { push, flush };
}
