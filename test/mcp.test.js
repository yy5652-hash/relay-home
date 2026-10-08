import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { Homes } from '../src/domain/store.js';
import { createRelayServer } from '../src/mcp/server.js';

async function connect({ answer = true, homes = new Homes(mkdtempSync(join(tmpdir(), 'relay-'))) } = {}) {
  const server = createRelayServer({ homes, id: 'test-home', secret: 'test-secret' });
  const asked = [];
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: { elicitation: { form: {} } } });
  client.setRequestHandler('elicitation/create', async request => {
    asked.push(request.params.message);
    return answer ? { action: 'accept', content: { confirm: true } } : { action: 'decline' };
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name, args = {}) => client.callTool({ name, arguments: args });
  return { client, call, asked, homes };
}

test('the server lists its tools, the views they render and the UI resources', async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['ask_helper', 'cancel_grocery_order', 'confirm_action', 'draft_evening_plan', 'find_pickup_helpers', 'get_household', 'place_grocery_order', 'quote_groceries', 'record_helper_reply', 'suggest_dinners', 'update_preferences', 'withdraw_pickup_request']);
  assert.equal(tools.find(tool => tool.name === 'draft_evening_plan')._meta.ui.resourceUri, 'ui://relay-home/plan.html');
  const { resources } = await client.listResources();
  assert.equal(resources.filter(resource => resource.uri.startsWith('ui://relay-home/')).length, 4);
  const view = await client.readResource({ uri: 'ui://relay-home/plan.html' });
  assert.equal(view.contents[0].mimeType, 'text/html;profile=mcp-app');
});

test('a plan can be drafted, and buying asks the person before anything is ordered', async () => {
  const { call, asked, homes } = await connect();
  const drafted = await call('draft_evening_plan', { maxMinutes: 30 });
  assert.equal(drafted.structuredContent.plan.pickup.who, 'Jo');
  homes.update('test-home', home => { home.pantry.onion = 0; });
  const plan = (await call('draft_evening_plan', {})).structuredContent.plan;
  assert.ok(plan.dinner.missing.length > 0);
  const quoted = (await call('quote_groceries', { items: plan.dinner.missing })).structuredContent;
  const bought = await call('place_grocery_order', { quoteToken: quoted.quoteToken, orderKey: 'evening-1' });
  assert.equal(asked.length, 1);
  assert.match(asked[0], /^Buy .* for \$\d+\.\d\d\?/);
  assert.equal(bought.structuredContent.order.status, 'placed');
  assert.equal(homes.read('test-home').orders.length, 1);
  const again = await call('place_grocery_order', { quoteToken: quoted.quoteToken, orderKey: 'evening-1' });
  assert.equal(again.structuredContent.order.repeated, true);
  assert.equal(asked.length, 1);                                          // the retry bought nothing and asked nothing
  assert.equal(homes.read('test-home').orders.length, 1);
});

test('without a yes nothing is bought and nobody is asked', async () => {
  const { call, homes, asked } = await connect({ answer: false });
  homes.update('test-home', home => { home.pantry.onion = 0; });
  const plan = (await call('draft_evening_plan', {})).structuredContent.plan;
  const quoted = (await call('quote_groceries', { items: plan.dinner.missing })).structuredContent;
  const order = await call('place_grocery_order', { quoteToken: quoted.quoteToken, orderKey: 'evening-2' });
  assert.equal(order.structuredContent.done, false);
  assert.equal(homes.read('test-home').orders.length, 0);
  const ask = await call('ask_helper', { name: 'Jo' });
  assert.equal(ask.structuredContent.done, false);
  // The evening card that this result is drawn in still shows the unchanged plan.
  assert.equal(ask.structuredContent.plan.pickup.status, 'not asked');
  assert.equal(homes.read('test-home').requests.length, 0);
  // Each question was put to the person once; a no is not asked again.
  assert.equal(asked.length, 2);
});

test('an unapproved neighbour cannot be asked, and a refusal leads to a blocked plan', async () => {
  const { call } = await connect();
  const lee = await call('ask_helper', { name: 'Lee' });
  assert.equal(lee.isError, true);
  assert.match(lee.content[0].text, /not on the school pickup list/i);
  const asked = await call('ask_helper', { name: 'Jo' });
  assert.equal(asked.structuredContent.request.status, 'awaiting reply');
  await call('record_helper_reply', { requestId: asked.structuredContent.request.id, accepted: false });
  const plan = (await call('draft_evening_plan', {})).structuredContent.plan;
  assert.equal(plan.pickup, null);
  assert.equal(plan.blockers.length, 1);
});

test('a quote says when the basket is not what the drafted dinner needs', async () => {
  const { call } = await connect();
  await call('draft_evening_plan', {});                                   // soup: everything is in the pantry
  const stray = await call('quote_groceries', { items: ['spinach'] });
  assert.equal(stray.structuredContent.matchesDraftedDinner, false);
  assert.match(stray.content[0].text, /drafted dinner is chickpea and tomato soup.*draft_evening_plan/);
  await call('draft_evening_plan', { meal: 'pasta' });
  const fits = await call('quote_groceries', { items: ['spinach'] });
  assert.equal(fits.structuredContent.matchesDraftedDinner, true);
  assert.doesNotMatch(fits.content[0].text, /Note:/);
});

test('cancelling an order, taking back a request and raising the cap all wait for a yes', async () => {
  const yes = await connect();
  await yes.call('draft_evening_plan', { meal: 'pasta' });
  const quoted = (await yes.call('quote_groceries', { items: ['spinach'] })).structuredContent;
  const order = (await yes.call('place_grocery_order', { quoteToken: quoted.quoteToken, orderKey: 'evening-9' })).structuredContent.order;
  const request = (await yes.call('ask_helper', { name: 'Jo' })).structuredContent.request;
  const home = () => yes.homes.read('test-home');

  const no = await connect({ answer: false, homes: yes.homes });
  assert.equal((await no.call('cancel_grocery_order', { orderId: order.id })).structuredContent.done, false);
  assert.equal(home().orders[0].status, 'placed');
  assert.equal((await no.call('withdraw_pickup_request', { requestId: request.id })).structuredContent.done, false);
  assert.equal(home().requests[0].status, 'awaiting reply');
  assert.equal((await no.call('update_preferences', { weeklyGroceryCap: 500 })).structuredContent.done, false);
  assert.equal(home().memory.weeklyGroceryCap, 40);
  assert.deepEqual(no.asked, [`Cancel order ${order.id} (spinach, $3.20)?`, 'Take back the request to Jo?', 'Change what Relay remembers: weekly grocery cap $40.00 to $500.00?']);

  assert.equal((await yes.call('cancel_grocery_order', { orderId: order.id })).structuredContent.order.status, 'cancelled');
  assert.equal(home().memory.spentThisWeek, 21.4);
  assert.equal((await yes.call('withdraw_pickup_request', { requestId: request.id })).structuredContent.request.status, 'withdrawn');
  assert.equal((await yes.call('update_preferences', { weeklyGroceryCap: 60 })).structuredContent.memory.weeklyGroceryCap, 60);
});

test('when the helper says no, the stored plan is drawn again and names nobody who is not eligible', async () => {
  const { call } = await connect();
  await call('draft_evening_plan', { budget: 8 });
  const request = (await call('ask_helper', { name: 'Jo' })).structuredContent.request;
  const answer = await call('record_helper_reply', { requestId: request.id, accepted: false });
  assert.equal(answer.structuredContent.plan.pickup, null);
  assert.equal(answer.structuredContent.plan.constraints.budget, 8);
  assert.match(answer.content[0].text, /Jo cannot do it.*drawn again: Nobody on the school pickup list/);
  assert.equal((await call('get_household')).structuredContent.plan.pickup, null);
});
