import express from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { Store } from './store.js';
import { createMcpServer } from './mcp.js';
import { runAgent } from './agent.js';
import { changeScenario, commit, declinePickup, undo } from './planner.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const matches = (actual, expected) => {
  const first = Buffer.from(actual ?? '');
  const second = Buffer.from(expected);
  return first.length === second.length && timingSafeEqual(first, second);
};

export async function startServer({ port = 4317, dataDir = resolve(root, '.data') } = {}) {
  const store = new Store(resolve(dataDir, 'household.json'));
  const tokenPath = resolve(dataDir, 'mcp-token');
  let token;
  try { token = readFileSync(tokenPath, 'utf8').trim(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    token = randomBytes(32).toString('hex');
    writeFileSync(tokenPath, token, { mode: 0o600 });
  }
  const csrf = randomBytes(32).toString('hex');
  const app = express();
  app.disable('x-powered-by');
  let baseUrl;
  let localPort;
  app.use((request, response, next) => {
    const validHosts = [`127.0.0.1:${localPort}`, `localhost:${localPort}`];
    if (!validHosts.includes(request.get('host'))) return response.status(403).json({ error: 'Invalid host.' });
    const origin = request.get('origin');
    if (origin && !validHosts.map(host => `http://${host}`).includes(origin)) return response.status(403).json({ error: 'Invalid origin.' });
    response.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use('/mcp', (request, response, next) => {
    if (!matches(request.get('authorization'), `Bearer ${token}`)) return response.status(401).json({ error: 'MCP bearer token required.' });
    next();
  });
  app.post('/mcp', async (request, response) => {
    const server = createMcpServer(store);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    response.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  });
  app.all('/mcp', (request, response) => response.status(405).set('Allow', 'POST').end());
  app.get('/api/state', (request, response) => response.json({ state: store.read(), csrf, mode: 'Constrained planner · synthetic household', protocol: '2025-11-25', mcp: `${baseUrl}/mcp` }));
  app.use('/api', (request, response, next) => {
    if (!matches(request.get('x-relay-csrf'), csrf)) return response.status(403).json({ error: 'Reload the app before making changes.' });
    if (!request.is('application/json')) return response.status(415).json({ error: 'JSON required.' });
    next();
  });
  app.post('/api/chat', async (request, response) => {
    const { message } = z.object({ message: z.string().trim().min(1).max(1000) }).strict().parse(request.body);
    const answer = await runAgent({ url: `${baseUrl}/mcp`, token, store, message });
    store.update(state => { state.messages = [...state.messages, { role: 'user', text: message }, { role: 'assistant', text: answer.text, trace: answer.trace }].slice(-30); return null; });
    response.json({ ...answer, state: store.read() });
  });
  app.post('/api/confirm', (request, response) => {
    const { planId } = z.object({ planId: z.string().uuid() }).strict().parse(request.body);
    const result = store.update(state => commit(state, planId));
    response.json({ ...result, state: store.read() });
  });
  app.post('/api/undo', (request, response) => {
    const { planId } = z.object({ planId: z.string().uuid() }).strict().parse(request.body);
    const result = store.update(state => undo(state, planId));
    response.json({ ...result, state: store.read() });
  });
  app.post('/api/pickup-declined', (request, response) => {
    const { planId } = z.object({ planId: z.string().uuid() }).strict().parse(request.body);
    const result = store.update(state => declinePickup(state, planId));
    response.json({ ...result, state: store.read() });
  });
  app.post('/api/scenario', (request, response) => {
    const { scenario } = z.object({ scenario: z.enum(['rain', 'no-helper', 'early-sam']) }).strict().parse(request.body);
    store.update(state => { changeScenario(state, scenario); return null; });
    response.json({ state: store.read() });
  });
  app.use(express.static(resolve(root, 'public')));
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    const status = error instanceof z.ZodError ? 400 : error.status ?? 500;
    response.status(status).json({ error: status === 500 ? 'The request failed. Your last saved state is preserved; try again.' : error instanceof z.ZodError ? 'Invalid input. Check the supplied values.' : error.message });
  });
  const httpServer = await new Promise((resolveServer, reject) => {
    const listening = app.listen(port, '127.0.0.1', error => error ? reject(error) : resolveServer(listening));
    listening.on('error', reject);
  });
  localPort = httpServer.address().port;
  baseUrl = `http://127.0.0.1:${localPort}`;
  return { httpServer, store, token, baseUrl, close: () => new Promise(resolveClose => { httpServer.close(resolveClose); httpServer.closeIdleConnections(); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const running = await startServer({ port: Number(process.env.PORT ?? 4317), dataDir: process.env.RELAY_DATA_DIR ?? resolve(root, '.data') });
  console.log(`Relay Home is ready at ${running.baseUrl}`);
  console.log('Synthetic demo data. Local only. MCP token stored in the data directory; do not publish it.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await running.close(); process.exit(0); });
}
