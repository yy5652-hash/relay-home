// The web server: a Streamable HTTP MCP endpoint at /mcp, protected by a bearer token that names one household,
// plus the small API the simulator page uses. `createApp` returns the Express app without listening, for the tests.
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createMcpExpressApp, requireBearerAuth } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { newConversation, runTurn } from './agent/loop.js';
import { ModelUnavailable, pickModel } from './agent/models.js';
import { ScriptedModel } from './agent/scripted.js';
import { loadSkill } from './agent/skill.js';
import { seal, unseal } from './domain/actions.js';
import { Homes } from './domain/store.js';
import { createRelayServer } from './mcp/server.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The signing secret lives next to the data, is created on first start and never leaves the machine.
function loadSecret(dir) {
  if (process.env.RELAY_SECRET) return process.env.RELAY_SECRET;
  const file = join(dir, 'secret');
  if (!existsSync(file)) { mkdirSync(dir, { recursive: true }); writeFileSync(file, randomBytes(32).toString('base64url'), { mode: 0o600 }); }
  return readFileSync(file, 'utf8').trim();
}

export function createApp({ dataDir = process.env.RELAY_DATA_DIR ?? join(ROOT, '.data'), host = '127.0.0.1', allowedHosts, model = pickModel() } = {}) {
  const secret = loadSecret(dataDir);
  const homes = new Homes(join(dataDir, 'homes'));
  const app = createMcpExpressApp({ host, allowedHosts });
  app.disable('x-powered-by');

  // A token is the sealed household id with an expiry: nothing to store or look up, and it cannot be forged without the secret.
  const MONTH = 30 * 24 * 3600;
  const issue = (home = randomUUID()) => ({ home, token: seal({ home, exp: Math.floor(Date.now() / 1000) + MONTH }, secret) });
  const verifier = {
    async verifyAccessToken(token) {
      const claim = unseal(token, secret);
      if (!claim?.home || !(claim.exp > Date.now() / 1000)) throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown, altered or expired token');
      return { token, clientId: claim.home, scopes: ['household'], expiresAt: claim.exp, extra: { home: claim.home } };
    }
  };

  // One server per request, built for the household the token names. The handler speaks the 2026-07-28 revision
  // and still answers 2025-11-25 clients statelessly.
  const mcp = toNodeHandler(createMcpHandler(ctx => createRelayServer({ homes, id: ctx.authInfo.extra.home, secret, canAsk: ctx.era === 'modern' })));
  app.post('/mcp', requireBearerAuth({ verifier }), (req, res) => mcp(req, res, req.body));
  app.all('/mcp', (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'This server is stateless: use POST.' }));

  // The simulator page asks for a household of its own; the token it gets is the same one any MCP client can use.
  app.post('/api/session', (req, res) => {
    const known = unseal(req.body?.token, secret);
    res.json(issue(known?.home));
  });
  // The simulated Alexa+ side: an agent that has loaded the Agent Skill and reaches the household only through /mcp,
  // over real Streamable HTTP with the visitor's own token. Events are streamed so the page can show each step.
  const skill = loadSkill();
  // If a hosted model cannot be reached, the built-in scripted one takes the turn so the demo keeps working.
  const standIn = model instanceof ScriptedModel ? null : new ScriptedModel();
  const chats = new Map();      // household id -> { conversation, waiting: Map(question id -> resolve) }
  const chatOf = home => chats.get(home) ?? chats.set(home, { conversation: newConversation(), waiting: new Map() }).get(home);

  app.post('/api/chat', requireBearerAuth({ verifier }), async (req, res) => {
    const text = String(req.body?.text ?? '').trim().slice(0, 500);
    if (!text) return res.status(400).json({ error: 'Say something first.' });
    const chat = chatOf(req.auth.extra.home);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
    const emit = event => res.write(`data: ${JSON.stringify(event)}\n\n`);
    const client = new Client({ name: 'relay-alexa-simulator', version: '2.0.0' }, { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode: 'auto' } });
    // Relay's confirmation question travels to the page and waits there for a tap.
    client.setRequestHandler('elicitation/create', request => new Promise(resolve => {
      const id = randomUUID();
      const timer = setTimeout(() => { chat.waiting.delete(id); resolve({ action: 'cancel' }); }, 120_000);
      chat.waiting.set(id, yes => { clearTimeout(timer); chat.waiting.delete(id); resolve(yes ? { action: 'accept', content: { confirm: true } } : { action: 'decline' }); });
      emit({ type: 'ask', id, question: request.params.message });
    }));
    try {
      const address = req.socket.localPort;
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${req.auth.token}` } } }));
      emit({ type: 'connected', protocol: client.getNegotiatedProtocolVersion(), server: client.getServerVersion()?.name, model: model.name, skill: skill.name });
      const mark = chat.conversation.messages.length;
      try { await runTurn({ client, model, skill, conversation: chat.conversation, text, emit }); } catch (error) {
        if (!standIn || !(error instanceof ModelUnavailable)) throw error;
        chat.conversation.messages.length = mark;
        emit({ type: 'model', model: `${standIn.name}; ${model.name} did not answer`, reason: error.message });
        await runTurn({ client, model: standIn, skill, conversation: chat.conversation, text, emit });
      }
    } catch (error) {
      emit({ type: 'say', text: `Something went wrong on my side: ${error.message}` });
    } finally {
      emit({ type: 'done' });
      res.end();
      await client.close().catch(() => {});
    }
  });
  // The page is the MCP Apps host. What a card needs from the MCP server (its ui:// resource, a read-only tool call)
  // is fetched here with the visitor's own token, exactly as any other client would.
  const asClient = async (req, work) => {
    const client = new Client({ name: 'relay-simulator-host', version: '2.0.0' }, { versionNegotiation: { mode: 'auto' } });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${req.socket.localPort}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${req.auth.token}` } } }));
      return await work(client);
    } finally { await client.close().catch(() => {}); }
  };
  const viewCache = new Map();
  app.get('/api/view', requireBearerAuth({ verifier }), async (req, res) => {
    const uri = String(req.query.uri ?? '');
    if (!uri.startsWith('ui://relay-home/')) return res.status(400).json({ error: 'Unknown view.' });
    try {
      if (!viewCache.has(uri)) viewCache.set(uri, await asClient(req, async client => (await client.readResource({ uri })).contents[0].text));
      res.type('html').send(viewCache.get(uri));
    } catch (error) { res.status(404).json({ error: String(error.message) }); }
  });
  const CARD_TOOLS = new Set(['get_household', 'find_pickup_helpers', 'suggest_dinners']);
  app.post('/api/tool', requireBearerAuth({ verifier }), async (req, res) => {
    const { name, arguments: args } = req.body ?? {};
    if (!CARD_TOOLS.has(name)) return res.json({ content: [{ type: 'text', text: 'Cards may only read. Ask Relay in the conversation to change something.' }], isError: true });
    try { res.json(await asClient(req, client => client.callTool({ name, arguments: args ?? {} }))); } catch (error) { res.json({ content: [{ type: 'text', text: String(error.message) }], isError: true }); }
  });
  // The household panel beside the conversation reads the same state the tools work on.
  app.get('/api/home', requireBearerAuth({ verifier }), (req, res) => {
    const home = homes.read(req.auth.extra.home);
    res.json({ event: home.event, child: home.child, people: home.people.map(person => ({ name: person.name, role: person.role, approved: person.approved, note: person.note })), pantry: home.pantry, memory: home.memory, requests: home.requests, orders: home.orders, log: home.log.slice(-10) });
  });
  app.post('/api/answer', requireBearerAuth({ verifier }), (req, res) => {
    const resolve = chatOf(req.auth.extra.home).waiting.get(String(req.body?.id));
    if (!resolve) return res.status(404).json({ error: 'That question is no longer open.' });
    resolve(req.body?.yes === true);
    res.json({ ok: true });
  });
  app.post('/api/reset', requireBearerAuth({ verifier }), (req, res) => { homes.reset(req.auth.extra.home); chats.delete(req.auth.extra.home); res.json({ ok: true }); });
  app.get('/api/health', (req, res) => res.json({ ok: true, name: 'relay-home', version: '2.0.0' }));

  app.use(express.static(join(ROOT, 'public')));
  return { app, homes, secret, issue };
}
