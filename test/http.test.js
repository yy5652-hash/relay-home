import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { ModelUnavailable } from '../src/agent/models.js';
import { createApp } from '../src/http.js';

let server, base, relay;
before(async () => {
  relay = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'relay-http-')) });
  server = relay.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function connect(token, onAsk = async () => ({ action: 'accept', content: { confirm: true } }), mode = 'auto') {
  const client = new Client({ name: 'http-test', version: '1.0.0' }, { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode } });
  client.setRequestHandler('elicitation/create', onAsk);
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}
const session = async () => (await fetch(`${base}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();

test('the endpoint rejects a missing or forged token', async () => {
  const init = { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) };
  assert.equal((await fetch(`${base}/mcp`, init)).status, 401);
  const forged = await fetch(`${base}/mcp`, { ...init, headers: { ...init.headers, authorization: 'Bearer abc.def' } });
  assert.equal(forged.status, 401);
  assert.equal((await fetch(`${base}/mcp`)).status, 405);
});

test('over Streamable HTTP: read, draft, confirm and buy, with each household kept apart', async () => {
  const first = await session();
  const second = await session();
  assert.notEqual(first.home, second.home);
  const asked = [];
  const client = await connect(first.token, async request => { asked.push(request.params.message); return { action: 'accept', content: { confirm: true } }; });
  assert.match(client.getServerVersion().name, /relay-home/);
  assert.equal(client.getNegotiatedProtocolVersion(), '2026-07-28');
  assert.equal((await client.listTools()).tools.length, 12);
  relay.homes.update(first.home, home => { home.pantry.onion = 0; });
  const plan = (await client.callTool({ name: 'draft_evening_plan', arguments: {} })).structuredContent.plan;
  const quoted = (await client.callTool({ name: 'quote_groceries', arguments: { items: plan.dinner.missing } })).structuredContent;
  const order = (await client.callTool({ name: 'place_grocery_order', arguments: { quoteToken: quoted.quoteToken, orderKey: 'http-order-1' } })).structuredContent.order;
  assert.equal(order.status, 'placed');
  assert.equal(asked.length, 1);
  const other = await connect(second.token);
  const theirs = (await other.callTool({ name: 'get_household', arguments: {} })).structuredContent;
  assert.equal(theirs.orders.length, 0);                                  // the second household saw none of it
  const mine = (await client.callTool({ name: 'get_household', arguments: {} })).structuredContent;
  assert.equal(mine.orders.length, 1);
  await client.close(); await other.close();
});

test('a session token survives and brings the same household back', async () => {
  const first = await session();
  const again = await (await fetch(`${base}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: first.token }) })).json();
  assert.equal(again.home, first.home);
});

test('a 2025-11-25 client gets a ticket instead of a prompt, and nothing happens until it is redeemed', async () => {
  const { home, token } = await session();
  const client = await connect(token, undefined, 'legacy');
  assert.equal(client.getNegotiatedProtocolVersion(), '2025-11-25');
  const asked = (await client.callTool({ name: 'ask_helper', arguments: { name: 'Jo' } })).structuredContent;
  assert.match(asked.needsConfirmation.question, /^Ask Jo to collect Mia/);
  assert.equal(relay.homes.read(home).requests.length, 0);
  const forged = await client.callTool({ name: 'confirm_action', arguments: { ticket: asked.needsConfirmation.ticket.replace(/.$/, 'x') } });
  assert.equal(forged.isError, true);
  const done = (await client.callTool({ name: 'confirm_action', arguments: { ticket: asked.needsConfirmation.ticket } })).structuredContent;
  assert.equal(done.request.status, 'awaiting reply');
  const twice = await client.callTool({ name: 'confirm_action', arguments: { ticket: asked.needsConfirmation.ticket } });
  assert.equal(twice.isError, true);                                       // the household moved on, so the ticket is spent
  await client.close();
});

// Reads the event stream of one chat turn; `onAsk` answers Relay's confirmation questions like a person tapping a button.
async function chat(token, text, onAsk = () => true) {
  const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ text }) });
  const events = [];
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += Buffer.from(chunk).toString();
    for (let cut = buffer.indexOf('\n\n'); cut >= 0; cut = buffer.indexOf('\n\n')) {
      const event = JSON.parse(buffer.slice(6, cut));
      buffer = buffer.slice(cut + 2);
      events.push(event);
      if (event.type === 'ask') await fetch(`${base}/api/answer`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ id: event.id, yes: onAsk(event.question) }) });
    }
  }
  return events;
}

test('the simulator\'s agent works through the real endpoint and waits for the person\'s tap before acting', async () => {
  const { home, token } = await session();
  const first = await chat(token, 'Pickup moved to 5:15, plan the evening under $8.');
  assert.deepEqual(first[0], { type: 'connected', protocol: '2026-07-28', server: 'relay-home', model: 'scripted (no key needed)', skill: 'relay-home-evening' });
  assert.deepEqual(first.filter(event => event.type === 'call').map(event => event.name), ['get_household', 'find_pickup_helpers', 'suggest_dinners', 'draft_evening_plan']);
  assert.match(first.find(event => event.type === 'say').text, /Shall I ask Jo\?$/);
  const questions = [];
  const second = await chat(token, 'Yes', question => { questions.push(question); return true; });
  assert.deepEqual(questions, ['Ask Jo to collect Mia at Oakfield School, main gate by 5:15 PM?']);
  assert.equal(relay.homes.read(home).requests[0].status, 'awaiting reply');
  assert.equal(second.at(-1).type, 'done');
  const third = await chat(token, 'Make the pasta and order what we need', () => false);
  assert.equal(third.find(event => event.type === 'say').text, 'Understood, nothing was ordered.');
  assert.equal(relay.homes.read(home).orders.length, 0);
});

test('the page can load a card and let it read, but a card cannot change anything', async () => {
  const { token, home } = await session();
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const view = await fetch(`${base}/api/view?uri=${encodeURIComponent('ui://relay-home/plan.html')}`, { headers });
  assert.equal(view.status, 200);
  assert.match(await view.text(), /^<!doctype html>.*data-view="plan"/s);
  assert.equal((await fetch(`${base}/api/view?uri=${encodeURIComponent('file:///etc/hosts')}`, { headers })).status, 400);
  const tool = async (name, args = {}) => (await fetch(`${base}/api/tool`, { method: 'POST', headers, body: JSON.stringify({ name, arguments: args }) })).json();
  assert.equal((await tool('get_household')).structuredContent.child, 'Mia');
  assert.equal((await tool('ask_helper', { name: 'Jo' })).isError, true);
  assert.equal((await tool('update_preferences', { weeklyGroceryCap: 500 })).isError, true);
  assert.equal(relay.homes.read(home).requests.length, 0);
  assert.equal(relay.homes.read(home).memory.weeklyGroceryCap, 40);
  assert.equal((await fetch(`${base}/api/tool`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
});

test('when the hosted model does not answer, the scripted one takes the turn and the page is told', async () => {
  const down = { name: 'hosted-model', next: async () => { throw new ModelUnavailable('The model service answered 429.'); } };
  const other = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'relay-fallback-')), model: down });
  const listener = other.app.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  try {
    const origin = `http://127.0.0.1:${listener.address().port}`;
    const { token } = await (await fetch(`${origin}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
    const response = await fetch(`${origin}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ text: 'Pickup moved to 5:15, plan the evening.' }) });
    const events = (await response.text()).split('\n\n').filter(Boolean).map(block => JSON.parse(block.slice(6)));
    assert.equal(events[0].model, 'hosted-model');
    assert.match(events.find(event => event.type === 'model').model, /^scripted.*hosted-model did not answer$/);
    assert.match(events.find(event => event.type === 'say').text, /Shall I ask Jo\?$/);
  } finally { listener.close(); }
});

test('a helper answers through their own link, which can do nothing else', async () => {
  const { home, token } = await session();
  const client = await connect(token);
  const household = async () => (await client.callTool({ name: 'get_household', arguments: {} })).structuredContent;
  await client.callTool({ name: 'draft_evening_plan', arguments: {} });
  const asked = (await client.callTool({ name: 'ask_helper', arguments: { name: 'Jo' } })).structuredContent;
  assert.match(asked.request.replyUrl, new RegExp(`^${base}/r/[\\w-]{12}$`));
  assert.equal(asked.plan.pickup.replyUrl, asked.request.replyUrl);          // the card shows it as a code to scan
  const link = asked.request.replyUrl.replace('/r/', '/api/reply/');
  const answer = accepted => fetch(link, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accepted }) });
  assert.match(await (await fetch(asked.request.replyUrl)).text(), /A pickup request/);
  // The link shows the one question that was asked and nothing else about the household.
  assert.deepEqual(await (await fetch(link)).json(), { helper: 'Jo', child: 'Mia', where: 'Oakfield School, main gate', by: '5:15 PM', from: 'Alex and Sam', status: 'awaiting reply' });
  assert.equal((await fetch(`${base}/api/reply/AAAAAAAAAAAA`)).status, 404);
  assert.equal((await answer('yes')).status, 400);
  assert.equal(relay.homes.read(home).requests[0].status, 'awaiting reply');
  assert.equal((await (await answer(true)).json()).status, 'confirmed');
  const covered = (await household()).plan.pickup;
  assert.deepEqual([covered.status, covered.answeredVia, covered.replyUrl], ['confirmed', 'link', undefined]);
  const page = await (await fetch(`${base}/api/home`, { headers: { authorization: `Bearer ${token}` } })).json();
  assert.deepEqual(page.announcements, ['Jo confirmed. The pickup is covered.']);
  // Jo drops out after all: the plan is drawn again and, with nobody else on the school list in time, names no one.
  assert.equal((await (await answer(false)).json()).status, 'declined');
  assert.equal((await household()).plan.pickup, null);
  const late = await answer(true);                                          // a no is final for today
  assert.equal(late.status, 409);
  assert.equal((await late.json()).status, 'declined');
  await client.close();
});

test('the agent is told what a helper answered from their phone since the person last spoke', async () => {
  const heard = [];
  const model = { name: 'listening-model', next: async ({ conversation }) => { heard.push(conversation.messages.map(message => `${message.role}: ${message.text}`)); return { text: 'Noted.' }; } };
  const other = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'relay-note-')), model });
  const listener = other.app.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  try {
    const origin = `http://127.0.0.1:${listener.address().port}`;
    const { home, token } = await (await fetch(`${origin}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
    const say = text => fetch(`${origin}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ text }) }).then(response => response.text());
    await say('Hello');
    const { requestPickup } = await import('../src/domain/actions.js');
    const request = other.homes.update(home, draft => requestPickup(draft, 'Jo', { origin }));
    other.homes.link(request.code, home);
    await fetch(`${origin}/api/reply/${request.code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"accepted":true}' });
    await say('Where are we?');
    assert.deepEqual(heard.at(-1).slice(-2), ['note: (Update from Relay Home, not said by the person: Jo confirmed. The pickup is covered.)', 'user: Where are we?']);
    await say('And now?');
    assert.equal(heard.at(-1).filter(line => line.startsWith('note:')).length, 1);     // told once
  } finally { listener.close(); }
});
