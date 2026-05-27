import { Router } from 'express';

export const sseRouter = Router();

sseRouter.get('/', async (req, res) => {
  const opencodeUrl = (req.headers['x-opencode-url'] as string) || req.query.url as string || 'http://127.0.0.1:4096';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  try {
    const response = await fetch(`${opencodeUrl}/events`, {
      headers: { 'Accept': 'text/event-stream' },
    });

    if (!response.ok) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'opencode SSE connection failed' })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'no response body' })}\n\n`);
      res.end();
      return;
    }

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
  }

  req.on('close', () => {
    console.log('[zmn-opencodex-server] SSE client disconnected');
  });

  res.end();
});
