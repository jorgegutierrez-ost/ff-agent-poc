import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root or backend dir
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import patientsRouter from './routes/patients';
import visitsRouter from './routes/visits';
import audioRouter from './routes/audio';
import { handleWebSocket } from './ws/handler';
import { migrate } from './db/migrate';
import { seed } from './db/seed';

const PORT = parseInt(process.env.PORT ?? '3030', 10);

// Dynamic CORS — allow configured origins or default to localhost
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, same-origin)
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive for now — tighten in production
      }
    },
  }),
);
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// API routes
app.use('/api/patients', patientsRouter);
app.use('/api/visits', visitsRouter);
app.use('/api/audio', audioRouter);

// HTTP + WebSocket server
const server = http.createServer(app);

const wss = new WebSocketServer({ server });
wss.on('connection', handleWebSocket);

// Start
async function start(): Promise<void> {
  // Run schema migration
  try {
    await migrate();
  } catch (err) {
    console.error('[db] Migration failed:', err);
  }

  // Seed data
  try {
    await seed();
    console.log('[db] Seed complete');
  } catch (err) {
    console.error('[db] Seed failed:', err);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Listening on http://0.0.0.0:${PORT}`);
    console.log(`[ws]     WebSocket on ws://0.0.0.0:${PORT}/ws`);
  });
}

start();
