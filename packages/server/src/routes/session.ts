import { Router, type Request } from 'express';

export const sessionRouter = Router();

function getOpencodeUrl(req: Request): string {
  return (req.headers['x-opencode-url'] as string) || req.query.url as string || 'http://127.0.0.1:4096';
}

sessionRouter.get('/', async (req, res) => {
  const url = getOpencodeUrl(req);
  try {
    const response = await fetch(`${url}/session`);
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

sessionRouter.get('/:id', async (req, res) => {
  const url = getOpencodeUrl(req);
  try {
    const response = await fetch(`${url}/session/${req.params.id}`);
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

sessionRouter.post('/', async (req, res) => {
  const url = getOpencodeUrl(req);
  try {
    const response = await fetch(`${url}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

sessionRouter.delete('/:id', async (req, res) => {
  const url = getOpencodeUrl(req);
  try {
    const response = await fetch(`${url}/session/${req.params.id}`, {
      method: 'DELETE',
    });
    res.status(response.status).end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

sessionRouter.patch('/:id', async (req, res) => {
  const url = getOpencodeUrl(req);
  try {
    const response = await fetch(`${url}/session/${req.params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});
