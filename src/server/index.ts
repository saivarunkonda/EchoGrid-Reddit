import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api';
import { menu } from './routes/menu';

const app = new Hono();

// Mount API routes
app.route('/api', api);

// Mount menu routes (internal endpoints for Devvit)
app.route('/internal/on/menu', menu);

// Health check
app.get('/ping', (c) => c.json({ pong: true }));

// Start server
const server = createServer(app);
serve({ fetch: server.fetch, port: getServerPort() });
console.log(`EchoGrid server running on port ${getServerPort()}`);
