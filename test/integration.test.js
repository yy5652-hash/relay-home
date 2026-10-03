import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startServer } from '../src/server.js';

let running;
let csrf;
const dataDir = mkdtempSync(join(tmpdir(), 'relay-http-'));
before(async () => {
  running = await startServer({ port: 0, dataDir });
  csrf = (await (await fetch(`${running.baseUrl}/api/state`)).json()).csrf;
});
after(async () => { await running?.close(); });
const post = (path, body, headers = {}) => fetch(`${running.baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relay-CSRF': csrf, ...headers }, body: JSON.stringify(body) });

test('MCP negotiates the exact required 2025-11-25 protocol over HTTP', async () => {
  const response = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'conformance-test', version: '1' } } }, { Authorization: `Bearer ${running.token}`, Accept: 'application/json, text/event-stream' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.protocolVersion, '2025-11-25');
});

test('official MCP client discovers tools and exercises the real planner', async () => {
  const client = new Client({ name: 'independent-test-client', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${running.baseUrl}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${running.token}` } } }));
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['explain_plan', 'household_context', 'preview_evening']);
    const result = await client.callTool({ name: 'preview_evening', arguments: { budget: 0 } });
    assert.equal(result.isError, undefined);
    const plan = result.structuredContent;
    assert.equal(plan.cost, 0);
    assert.equal(plan.helper, 'Jo');
    const explain = await client.callTool({ name: 'explain_plan', arguments: { planId: plan.id } });
    assert.equal(explain.structuredContent.planId, plan.id);
    const invalid = await client.callTool({ name: 'preview_evening', arguments: { budget: -1 } });
    assert.equal(invalid.isError, true);
  } finally { await client.close(); }
});

test('MCP resumes a draft and its constraints after a server restart', async () => {
  const isolatedDir = mkdtempSync(join(tmpdir(), 'relay-resume-'));
  let isolated = await startServer({ port: 0, dataDir: isolatedDir });
  const connect = async () => {
    const client = new Client({ name: 'resume-test-client', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${isolated.baseUrl}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${isolated.token}` } } }));
    return client;
  };
  try {
    let client = await connect();
    const first = (await client.callTool({ name: 'preview_evening', arguments: { budget: 2, excluded: ['Jo'] } })).structuredContent;
    assert.equal(first.helper, null);
    await client.close();
    await isolated.close();
    isolated = await startServer({ port: 0, dataDir: isolatedDir });
    client = await connect();
    try {
      const context = (await client.callTool({ name: 'household_context', arguments: {} })).structuredContent;
      assert.equal(context.latestPlan.id, first.id);
      assert.equal(context.latestPlan.preferences.budget, 2);
      assert.deepEqual(context.latestPlan.preferences.excluded, ['Jo']);
      const { csrf: isolatedCsrf } = await (await fetch(`${isolated.baseUrl}/api/state`)).json();
      const recap = await fetch(`${isolated.baseUrl}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relay-CSRF': isolatedCsrf }, body: JSON.stringify({ message: 'What do you remember?' }) });
      assert.equal(recap.status, 200);
      assert.match((await recap.json()).text, /latest draft is not saved.*Budget \$2\.00.*pickup option: none/);
      const resumed = (await client.callTool({ name: 'preview_evening', arguments: {} })).structuredContent;
      assert.equal(resumed.preferences.budget, 2);
      assert.equal(resumed.helper, null);
      for (const [message, helper, maxMinutes] of [['Jo is available', 'Jo', 30], ['Jo can’t make it', null, 30], ['Jo is available', 'Jo', 30], ['Plan dinner under 20 minutes', 'Jo', 20]]) {
        const response = await fetch(`${isolated.baseUrl}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relay-CSRF': isolatedCsrf }, body: JSON.stringify({ message }) });
        assert.equal(response.status, 200);
        const reply = await response.json();
        assert.equal(reply.plan.helper, helper);
        assert.equal(reply.plan.preferences.budget, 2);
        assert.equal(reply.plan.preferences.maxMinutes, maxMinutes);
        assert.deepEqual(reply.trace.map(item => item.name), ['tools/list', 'household_context', 'preview_evening']);
        assert.deepEqual(reply.state.tasks, []);
        assert.equal(reply.state.activePlan, null);
      }
      const revised = (await client.callTool({ name: 'preview_evening', arguments: { excluded: [] } })).structuredContent;
      assert.equal(revised.preferences.budget, 2);
      assert.equal(revised.preferences.maxMinutes, 20);
      assert.equal(revised.helper, 'Jo');
      const confirmation = await fetch(`${isolated.baseUrl}/api/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relay-CSRF': isolatedCsrf }, body: JSON.stringify({ planId: revised.id }) });
      assert.equal(confirmation.status, 200);
      const saved = (await client.callTool({ name: 'household_context', arguments: {} })).structuredContent;
      assert.equal(saved.activePlan, revised.id);
      assert.equal(saved.latestPlan.status, 'committed');
      assert.deepEqual(saved.tasks.map(task => task.id), ['pickup', 'dinner']);
      assert.deepEqual(saved.shopping, []);
      const competing = await client.callTool({ name: 'preview_evening', arguments: { budget: 5 } });
      assert.equal(competing.isError, true);
      assert.match(competing.content[0].text, /Undo the saved plan/);
      const unchanged = (await client.callTool({ name: 'household_context', arguments: {} })).structuredContent;
      assert.equal(unchanged.activePlan, revised.id);
      assert.equal(unchanged.latestPlan.status, 'committed');
      const savedRecap = await fetch(`${isolated.baseUrl}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relay-CSRF': isolatedCsrf }, body: JSON.stringify({ message: 'Recap' }) });
      assert.equal(savedRecap.status, 200);
      assert.match((await savedRecap.json()).text, /local plan is saved.*Pickup still needs the helper’s acknowledgment/);
    } finally { await client.close(); }
  } finally { await isolated.close(); }
});

test('API validates CSRF, Origin, host and request schema', async () => {
  assert.equal((await post('/api/confirm', { planId: 'bad' }, { 'X-Relay-CSRF': '' })).status, 403);
  assert.equal((await post('/api/chat', { message: 'Plan evening' }, { Origin: 'https://attacker.invalid' })).status, 403);
  const maliciousHostStatus = await new Promise((resolveStatus, reject) => {
    const request = httpRequest(`${running.baseUrl}/api/state`, { headers: { Host: 'attacker.invalid' } }, response => { response.resume(); resolveStatus(response.statusCode); });
    request.on('error', reject);
    request.end();
  });
  assert.equal(maliciousHostStatus, 403);
  assert.equal((await post('/api/chat', { message: '', extra: true })).status, 400);
  assert.equal((await post('/api/confirm', { planId: 'bad' })).status, 400);
});

test('MCP requires its own token and rejects unsupported protocol headers', async () => {
  assert.equal((await post('/mcp', {})).status, 401);
  const response = await post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { Authorization: `Bearer ${running.token}`, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '1900-01-01' });
  assert.equal(response.status, 400);
  assert.equal((await fetch(`${running.baseUrl}/mcp`, { headers: { Authorization: `Bearer ${running.token}` } })).status, 405);
});

test('full chat → MCP → consent → durable state → undo flow', async () => {
  const reply = await (await post('/api/chat', { message: 'Plan our evening under $8' })).json();
  assert.deepEqual(reply.trace.map(item => item.name), ['tools/list', 'household_context', 'preview_evening']);
  assert.equal(reply.plan.cost, 3.2);
  assert.equal(reply.state.tasks.length, 0);
  const first = await (await post('/api/confirm', { planId: reply.plan.id })).json();
  assert.equal(first.state.activePlan, reply.plan.id);
  const duplicate = await (await post('/api/confirm', { planId: reply.plan.id })).json();
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state.activity.length, 1);
  await running.close();
  running = await startServer({ port: 0, dataDir });
  const restored = await (await fetch(`${running.baseUrl}/api/state`)).json();
  csrf = restored.csrf;
  assert.equal(restored.state.activePlan, reply.plan.id);
  assert.equal(restored.state.messages.length, 2);
  const recap = await (await post('/api/chat', { message: 'What changed?' })).json();
  assert.match(recap.text, /Plan saved locally/);
  const undone = await (await post('/api/undo', { planId: reply.plan.id })).json();
  assert.equal(undone.state.activePlan, null);
  assert.deepEqual(undone.state.tasks, []);
  assert.deepEqual(undone.state.shopping, []);
  const historicalExplanation = await (await post('/api/chat', { message: 'Explain this plan' })).json();
  assert.match(historicalExplanation.text, /historical plan, not a current proposal/);
});

test('stale confirmation and expired draft constraints are rejected', async () => {
  const answer = await (await post('/api/chat', { message: 'Plan evening' })).json();
  const currentExplanation = await (await post('/api/chat', { message: 'Explain this plan' })).json();
  assert.doesNotMatch(currentExplanation.text, /stale|expired|historical plan/);
  await post('/api/scenario', { scenario: 'no-helper' });
  const staleExplanation = await (await post('/api/chat', { message: 'Explain this plan' })).json();
  assert.match(staleExplanation.text, /preview is stale.*Replan before confirming/);
  const recap = await (await post('/api/chat', { message: 'What do you remember?' })).json();
  assert.match(recap.text, /last draft is stale or expired/);
  const confirm = await post('/api/confirm', { planId: answer.plan.id });
  assert.equal(confirm.status, 409);
  const blocked = await (await post('/api/chat', { message: 'Replan evening' })).json();
  assert.equal(blocked.plan.helper, null);
  assert.ok(blocked.plan.blockers.length);
  assert.equal((await post('/api/confirm', { planId: blocked.plan.id })).status, 409);
  const constrained = await (await post('/api/chat', { message: 'Plan dinner under $2. Jo is unavailable.' })).json();
  assert.equal(constrained.plan.preferences.budget, 2);
  running.store.update(state => { state.plans.find(plan => plan.id === constrained.plan.id).expiresAt = Date.now() - 1; return null; });
  const expiredExplanation = await (await post('/api/chat', { message: 'Explain this plan' })).json();
  assert.match(expiredExplanation.text, /preview has expired.*Replan before confirming/);
  const fresh = await (await post('/api/chat', { message: 'Plan our evening' })).json();
  assert.equal(fresh.plan.preferences.budget, 12);
  assert.deepEqual(fresh.plan.preferences.excluded, []);
  const planCount = running.store.read().plans.length;
  const invalid = await (await post('/api/chat', { message: 'Plan dinner under $-5' })).json();
  assert.match(invalid.text, /Nothing was planned/);
  assert.deepEqual(invalid.trace, []);
  assert.equal(running.store.read().plans.length, planCount);
});

test('declined pickup reopens a safe plan without retaining the old assignment', async () => {
  await post('/api/scenario', { scenario: 'early-sam' });
  const planned = await (await post('/api/chat', { message: 'Plan our evening under $8' })).json();
  assert.equal(planned.plan.helper, 'Sam');
  await post('/api/confirm', { planId: planned.plan.id });
  const declined = await (await post('/api/pickup-declined', { planId: planned.plan.id })).json();
  assert.equal(declined.state.activePlan, null);
  assert.equal(declined.state.tasks.length, 0);
  assert.deepEqual(declined.state.preferences.excluded, ['Sam']);
  const replacement = await (await post('/api/chat', { message: 'Replan pickup' })).json();
  assert.equal(replacement.plan.helper, 'Jo');
  assert.equal(replacement.plan.preferences.budget, 8);
  assert.equal((await post('/api/pickup-declined', { planId: replacement.plan.id })).status, 409);
});
