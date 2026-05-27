import { Router } from 'express';
import { HealthResponse } from '../health.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  } satisfies HealthResponse);
});

healthRouter.get('/opencode-health', async (_req, res) => {
  const opencodeUrl = _req.query.url as string;
  if (!opencodeUrl) {
    res.status(400).json({ error: 'url query parameter required' });
    return;
  }

  try {
    const response = await fetch(`${opencodeUrl}/global/health`);
    const data = await response.json();
    res.json({
      status: response.ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      opencodeUrl,
      opencodeConnected: response.ok,
      opencodeData: data,
    } satisfies HealthResponse & { opencodeData?: unknown });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      opencodeUrl,
      opencodeConnected: false,
      error: message,
    });
  }
});
