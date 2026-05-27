export function terminalWebSocketURL(input: {
  baseUrl: string;
  ptyId: string;
  directory: string;
  cursor?: number;
  ticket?: string;
}): string {
  const next = new URL(`${input.baseUrl.replace(/\/$/, '')}/pty/${input.ptyId}/connect`);
  next.searchParams.set('directory', input.directory);
  next.searchParams.set('cursor', String(input.cursor ?? 0));
  next.protocol = next.protocol === 'https:' ? 'wss:' : 'ws:';
  if (input.ticket) {
    next.searchParams.set('ticket', input.ticket);
  }
  return next.toString();
}
