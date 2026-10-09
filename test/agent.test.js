import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { newConversation, runTurn } from '../src/agent/loop.js';
import { GeminiModel, ModelUnavailable, OpenAICompatModel, pickModel } from '../src/agent/models.js';
import { ScriptedModel } from '../src/agent/scripted.js';
import { loadSkill } from '../src/agent/skill.js';
import { Homes } from '../src/domain/store.js';
import { createRelayServer } from '../src/mcp/server.js';

async function setup({ yes = true } = {}) {
  const homes = new Homes(mkdtempSync(join(tmpdir(), 'relay-agent-')));
  const server = createRelayServer({ homes, id: 'agent-home', secret: 'test-secret' });
  const questions = [];
  const client = new Client({ name: 'agent-test', version: '1.0.0' }, { capabilities: { elicitation: { form: {} } } });
  client.setRequestHandler('elicitation/create', async request => { questions.push(request.params.message); return yes ? { action: 'accept', content: { confirm: true } } : { action: 'decline' }; });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const conversation = newConversation();
  const events = [];
  const say = text => runTurn({ client, model: new ScriptedModel(), skill: loadSkill(), conversation, text, emit: event => events.push(event) });
  return { say, events, questions, homes };
}

test('the skill loads and names itself after its folder', () => {
  const skill = loadSkill();
  assert.equal(skill.name, 'relay-home-evening');
  assert.match(skill.instructions, /Only someone `find_pickup_helpers` marks as eligible may be asked/);
});

test('one sentence from the person becomes a read, two parallel look-ups and a draft', async () => {
  const { say, events } = await setup();
  const answer = await say('School moved Mia\'s pickup to 5:15 and Alex is late. Keep dinner under $8.');
  assert.deepEqual(events.filter(event => event.type === 'call').map(event => event.name), ['get_household', 'find_pickup_helpers', 'suggest_dinners', 'draft_evening_plan']);
  assert.equal(events.find(event => event.type === 'result' && event.name === 'draft_evening_plan').view, 'ui://relay-home/plan.html');
  assert.match(answer, /^Jo is on the school list and can be at the gate by 5:00 PM\./);
  assert.match(answer, /Shall I ask Jo\?$/);
});

test('yes asks the helper after a confirmation; a refusal by the helper ends in a blocked plan that names nobody else', async () => {
  const { say, questions, homes } = await setup();
  await say('Plan the evening.');
  const asked = await say('Yes');
  assert.equal(questions.length, 1);
  assert.match(asked, /^Jo has been asked\. The code on the screen opens Jo's own reply link, and I will count the pickup as covered once Jo answers\./);
  assert.equal(homes.read('agent-home').requests[0].status, 'awaiting reply');
  const blocked = await say('Jo can\'t make it.');
  assert.match(blocked, /Jo is out for today\. Nobody on the school pickup list can be there by 5:15 PM/);
  assert.doesNotMatch(blocked, /Lee/);
});

test('ordering goes through a quote and a confirmation, and saying no buys nothing', async () => {
  const bought = await setup();
  const done = await bought.say('Make the pasta and order what we need.');
  assert.match(bought.questions[0], /^Buy spinach from Corner Market \(simulated\) for \$3\.20\?/);
  assert.match(done, /^Ordered: spinach for \$3\.20\. Collect at the shop from 5:45 PM\.$/);
  assert.equal(bought.homes.read('agent-home').memory.spentThisWeek, 24.6);
  const refused = await setup({ yes: false });
  const nothing = await refused.say('Make the pasta and order what we need.');
  assert.equal(refused.homes.read('agent-home').orders.length, 0);
  assert.equal(nothing, 'Understood, nothing was ordered.');
});

test('the household is remembered between conversations', async () => {
  const { say } = await setup();
  await say('Plan the evening.');
  await say('Yes');
  const recap = await say('What do you remember?');
  assert.match(recap, /^Jo has been asked about the pickup and has not answered yet\./);
  assert.match(recap, /\$18\.60 is left of this week's grocery cap\.$/);
});

// The hosted adapters are checked against the wire format of each service with a stand-in for `fetch`; they have
// not been run against the live services in this repository's tests.
const TOOLS = [{ name: 'get_household', description: 'Read', inputSchema: { $schema: 'x', type: 'object', properties: {}, additionalProperties: false } }];
const history = () => ({ messages: [
  { role: 'user', text: 'Plan tonight' },
  { role: 'assistant', calls: [{ id: 'c1', name: 'get_household', args: {} }], raw: [{ functionCall: { name: 'get_household', args: {} }, thoughtSignature: 'sig' }] },
  { role: 'tool', results: [{ id: 'c1', name: 'get_household', summary: 'Pickup moved', data: { child: 'Mia' }, error: false }] }
] });
const fake = answer => { const seen = []; const fetch = async (url, init) => { seen.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return { ok: true, json: async () => answer }; }; return { fetch, seen }; };

test('the OpenAI-compatible adapter sends the skill, the tools and earlier tool results, and reads tool calls back', async () => {
  const { fetch, seen } = fake({ choices: [{ message: { tool_calls: [{ id: 'c2', type: 'function', function: { name: 'find_pickup_helpers', arguments: '{"exclude":["Jo"]}' } }] } }] });
  const model = new OpenAICompatModel({ key: 'k', base: 'https://llm.example/v1/', model: 'some-model', fetch });
  const move = await model.next({ instructions: 'Follow the skill.', tools: TOOLS, conversation: history() });
  assert.deepEqual(move.calls, [{ id: 'c2', name: 'find_pickup_helpers', args: { exclude: ['Jo'] } }]);
  const [{ url, headers, body }] = seen;
  assert.equal(url, 'https://llm.example/v1/chat/completions');
  assert.equal(headers.authorization, 'Bearer k');
  assert.deepEqual(body.messages.map(message => message.role), ['system', 'user', 'assistant', 'tool']);
  assert.equal(body.messages[2].tool_calls[0].function.name, 'get_household');
  assert.equal(body.messages[3].tool_call_id, 'c1');
  assert.equal(body.tools[0].function.name, 'get_household');
});

test('the Gemini adapter echoes the model\'s own parts on a tool turn and drops schema keys the service rejects', async () => {
  const { fetch, seen } = fake({ candidates: [{ content: { parts: [{ text: 'Jo can do it.' }] } }] });
  const model = new GeminiModel({ key: 'k', fetch });
  const move = await model.next({ instructions: 'Follow the skill.', tools: TOOLS, conversation: history() });
  assert.deepEqual(move, { text: 'Jo can do it.' });
  const [{ url, headers, body }] = seen;
  assert.match(url, /models\/gemini-[\w.-]+:generateContent$/);
  assert.equal(headers['x-goog-api-key'], 'k');
  assert.equal(body.contents[1].parts[0].thoughtSignature, 'sig');
  assert.equal(body.contents[2].parts[0].functionResponse.name, 'get_household');
  assert.deepEqual(body.tools[0].functionDeclarations[0].parameters, { type: 'object', properties: {} });
  assert.equal(body.systemInstruction.parts[0].text, 'Follow the skill.');
});

test('a refused or unreachable model service is reported as unavailable, and no key means the scripted model', async () => {
  const refused = new GeminiModel({ key: 'k', fetch: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(refused.next({ instructions: '', tools: TOOLS, conversation: history() }), ModelUnavailable);
  const offline = new OpenAICompatModel({ key: 'k', base: 'https://llm.example/v1', model: 'm', fetch: async () => { throw new Error('offline'); } });
  await assert.rejects(offline.next({ instructions: '', tools: TOOLS, conversation: history() }), ModelUnavailable);
  assert.ok(pickModel({}) instanceof ScriptedModel);
  assert.ok(pickModel({ GEMINI_API_KEY: 'k' }) instanceof GeminiModel);
  assert.ok(pickModel({ LLM_API_KEY: 'k', LLM_BASE_URL: 'https://llm.example/v1', LLM_MODEL: 'm' }) instanceof OpenAICompatModel);
});
