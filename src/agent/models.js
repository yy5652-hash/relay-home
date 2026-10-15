// Which model drives the agent. Without any key the scripted model runs, so the project works out of the box.
// With a key, a hosted model takes its place and gets the same instructions (the Agent Skill) and the same tools.
import { randomUUID } from 'node:crypto';
import { ScriptedModel } from './scripted.js';

// The hosted model could not be reached or refused the request (quota, bad key, outage).
export class ModelUnavailable extends Error {}
// A service that is briefly overloaded (502, 503, 504) is asked again, twice, a little later each time. A refusal
// (quota, a bad key) is not asked again: it would say the same.
const AGAIN_AFTER = [700, 1800];
// A hosted model's slow answers are far slower than its usual ones: on 15 October 2026 the same small request took
// 18 s, then 0.6 s, then 0.6 s, and a whole first turn usually took under 3 s. So a request still unanswered after
// HEDGE_AFTER ms is sent once more, and whichever answer comes back first is used; the other is cancelled.
const HEDGE_AFTER = 3000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const send = (fetch, url, init) => {
  const copy = { stop: new AbortController(), result: null };
  copy.done = Promise.resolve().then(() => fetch(url, { ...init, signal: copy.stop.signal }))
    .then(response => ({ response }), error => ({ error })).then(result => (copy.result = result));
  return copy;
};

async function fastest(fetch, url, init, hedge) {
  const sent = [send(fetch, url, init)];
  let timer;
  const late = new Promise(resolve => { timer = setTimeout(resolve, hedge, null); });
  const early = await Promise.race([sent[0].done, late]);
  clearTimeout(timer);
  if (early) return early;
  sent.push(send(fetch, url, init));
  // The first good answer wins. If one copy fails the other is waited for; if both fail, the first failure stands.
  const outcome = await new Promise(resolve => {
    let left = sent.length, failed = null;
    for (const copy of sent) copy.done.then(result => {
      if (result.response?.ok) return resolve(result);
      failed ??= result;
      if ((left -= 1) === 0) resolve(failed);
    });
  });
  for (const copy of sent) if (copy.result !== outcome) copy.stop.abort();
  return outcome;
}

const ask = async (fetch, url, init, pause = sleep, hedge = HEDGE_AFTER) => {
  for (let tries = 0; ; tries += 1) {
    const { response, error } = await fastest(fetch, url, init, hedge);
    if (error) throw new ModelUnavailable(`The model service could not be reached (${error.message}).`);
    if (response.ok) return response.json();
    if (![502, 503, 504].includes(response.status) || tries >= AGAIN_AFTER.length) throw new ModelUnavailable(`The model service answered ${response.status}.`);
    await pause(AGAIN_AFTER[tries]);
  }
};

const toolSchemas = tools => tools.map(tool => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema ?? { type: 'object', properties: {} } }));

// Any OpenAI-compatible chat-completions endpoint (set LLM_API_KEY, LLM_BASE_URL and LLM_MODEL).
export class OpenAICompatModel {
  constructor({ key, base, model, fetch = globalThis.fetch, pause, hedge }) { Object.assign(this, { key, base: base.replace(/\/$/, ''), model, fetch, pause, hedge, name: model }); }

  async next({ instructions, tools, conversation }) {
    const messages = [{ role: 'system', content: instructions }];
    for (const message of conversation.messages) {
      if (message.role === 'user' || message.role === 'note') messages.push({ role: 'user', content: message.text });
      else if (message.role === 'assistant' && message.calls) messages.push({ role: 'assistant', content: null, tool_calls: message.calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) });
      else if (message.role === 'assistant') messages.push({ role: 'assistant', content: message.text });
      else for (const result of message.results) messages.push({ role: 'tool', tool_call_id: result.id, content: JSON.stringify({ summary: result.summary, data: result.data, error: result.error }) });
    }
    const answer = await ask(this.fetch, `${this.base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.key}` }, body: JSON.stringify({ model: this.model, messages, tools: toolSchemas(tools).map(fn => ({ type: 'function', function: fn })), temperature: 0 }) }, this.pause, this.hedge);
    const choice = answer.choices[0].message;
    if (choice.tool_calls?.length) return { calls: choice.tool_calls.map(call => ({ id: call.id, name: call.function.name, args: JSON.parse(call.function.arguments || '{}') })) };
    return { text: choice.content ?? '' };
  }
}

// Google Gemini through its REST API (set GEMINI_API_KEY; GEMINI_MODEL is optional).
export class GeminiModel {
  constructor({ key, model = 'gemini-3.5-flash-lite', fetch = globalThis.fetch, pause, hedge }) { Object.assign(this, { key, model, fetch, pause, hedge, name: model }); }

  async next({ instructions, tools, conversation }) {
    const contents = [];
    for (const message of conversation.messages) {
      if (message.role === 'user' || message.role === 'note') contents.push({ role: 'user', parts: [{ text: message.text }] });
      // The model's own parts are sent back unchanged: newer Gemini models reject a tool turn without their signatures.
      else if (message.role === 'assistant' && message.calls) contents.push({ role: 'model', parts: message.raw ?? message.calls.map(call => ({ functionCall: { name: call.name, args: call.args } })) });
      else if (message.role === 'assistant') contents.push({ role: 'model', parts: [{ text: message.text }] });
      else contents.push({ role: 'user', parts: message.results.map(result => ({ functionResponse: { name: result.name, response: { summary: result.summary, data: result.data, error: result.error } } })) });
    }
    const clean = schema => JSON.parse(JSON.stringify(schema, (key, value) => (key === '$schema' || key === 'additionalProperties' ? undefined : value)));
    const body = { systemInstruction: { parts: [{ text: instructions }] }, contents, tools: [{ functionDeclarations: toolSchemas(tools).map(fn => ({ ...fn, parameters: clean(fn.parameters) })) }], generationConfig: { temperature: 0 } };
    const answer = await ask(this.fetch, `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': this.key }, body: JSON.stringify(body) }, this.pause, this.hedge);
    const parts = answer.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter(part => part.functionCall).map(part => ({ id: randomUUID().slice(0, 8), name: part.functionCall.name, args: part.functionCall.args ?? {} }));
    if (calls.length) return { calls, raw: parts };
    return { text: parts.map(part => part.text ?? '').join('').trim() };
  }
}

export function pickModel(env = process.env) {
  if (env.LLM_API_KEY && env.LLM_BASE_URL && env.LLM_MODEL) return new OpenAICompatModel({ key: env.LLM_API_KEY, base: env.LLM_BASE_URL, model: env.LLM_MODEL });
  if (env.GEMINI_API_KEY) return new GeminiModel({ key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  return new ScriptedModel();
}
