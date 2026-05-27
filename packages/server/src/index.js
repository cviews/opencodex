import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { sessionRouter } from './routes/session.js';
import { sseRouter } from './routes/sse.js';
export const SERVER_PORT = 8791;
export const SERVER_HOST = '127.0.0.1';
const app = express();
app.use(cors());
app.use(express.json());
app.use('/global', healthRouter);
app.use('/session', sessionRouter);
app.use('/events', sseRouter);
app.listen(SERVER_PORT, SERVER_HOST, () => {
    console.log(`[zmn-opencodex-server] Listening on http://${SERVER_HOST}:${SERVER_PORT}`);
});
