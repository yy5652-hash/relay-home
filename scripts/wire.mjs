// The consent round trip, as it travels: every HTTP exchange with /mcp while one helper is asked, printed with its
// timing. Starts a server of its own on a free port with a throw-away household, so it runs anywhere:
//
//   node scripts/wire.mjs            the person says yes
//   node scripts/wire.mjs no         the person says no
//
// What to look for: the first tools/call comes back as `input_required` with a question and a sealed requestState;
// the client asks the person and sends the same call again with the answer and that state; only then is anything done.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../src/http.js';
import { ScriptedModel } from '../src/agent/scripted.js';

const yes = process.argv[2] !== 'no';
const relay = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'relay-wire-')), model: new ScriptedModel() });
const server = relay.app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const { token } = await (await fetch(`${base}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();

// Long opaque values are shortened for reading; nothing else is changed.
const short = value => JSON.parse(JSON.stringify(value, (key, item) => (typeof item === 'string' && item.length > 44 && /^[\w.-]+$/.test(item) ? `${item.slice(0, 18)}…(${item.length} chars)` : item)));
const pick = body => {
  const out = {};
  if (body.method) out.method = body.method;
  const params = body.params ?? {};
  if (params.name) out.name = params.name;
  if (params.arguments && Object.keys(params.arguments).length) out.arguments = params.arguments;
  if (params.inputResponses) out.inputResponses = params.inputResponses;
  if (params.requestState) out.requestState = params.requestState;
  const result = body.result;
  if (result) {
    if (result.resultType) out.resultType = result.resultType;
    if (result.inputRequests) out.inputRequests = Object.fromEntries(Object.entries(result.inputRequests).map(([key, request]) => [key, { method: request.method, message: request.params?.message }]));
    if (result.requestState) out.requestState = result.requestState;
    if (result.content) out.text = result.content.find(part => part.type === 'text')?.text;
    if (result.structuredContent?.request) out.request = (({ id, name, status, replyUrl }) => ({ id, name, status, replyUrl }))(result.structuredContent.request);
    if (result.structuredContent?.done !== undefined) out.done = result.structuredContent.done;
  }
  if (body.error) out.error = body.error;
  return short(out);
};
let n = 0;
const show = process.argv.includes('--all') ? () => true : body => body?.params?.name === 'ask_helper';
const logged = async (url, init) => {
  const started = performance.now();
  const sent = init?.body ? JSON.parse(init.body) : null;
  const response = await fetch(url, init);
  const text = await response.clone().text();
  const ms = (performance.now() - started).toFixed(1);
  if (sent && show(sent)) {
    const data = text.startsWith('{') ? JSON.parse(text) : JSON.parse(text.split('\n').find(line => line.startsWith('data: '))?.slice(6) ?? '{}');
    n += 1;
    console.log(`\n── exchange ${n} ── POST /mcp ── ${response.status} in ${ms} ms`);
    console.log('→', JSON.stringify(pick(sent)));
    console.log('←', JSON.stringify(pick(data)));
  }
  return response;
};

const client = new Client({ name: 'wire', version: '1.0.0' }, { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode: 'auto' } });
client.setRequestHandler('elicitation/create', async request => {
  console.log(`\n   the person is asked: "${request.params.message}"  →  ${yes ? 'yes' : 'no'}`);
  return yes ? { action: 'accept', content: { confirm: true } } : { action: 'decline' };
});
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { fetch: logged, requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
console.log(`Relay Home on ${base}/mcp, protocol ${client.getNegotiatedProtocolVersion()}`);
await client.callTool({ name: 'draft_evening_plan', arguments: {} });
const result = await client.callTool({ name: 'ask_helper', arguments: { name: 'Jo' } });
const request = result.structuredContent?.request;
if (request) {
  const started = performance.now();
  const answered = await (await fetch(request.replyUrl.replace('/r/', '/api/reply/'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"accepted":true}' })).json();
  console.log(`\n── the helper's phone ── POST /api/reply/‹code› ── in ${(performance.now() - started).toFixed(1)} ms`);
  console.log('→', JSON.stringify({ accepted: true }));
  console.log('←', JSON.stringify(answered));
}
console.log(`\nhousehold: ${relay.homes.read(Object.values(relay.homes.links)[0] ?? '').requests?.map(item => `${item.name} ${item.status}`).join(', ') || 'no request was recorded'}`);
await client.close();
server.close();
