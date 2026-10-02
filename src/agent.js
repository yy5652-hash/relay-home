import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { parseMessage } from './planner.js';

export async function runAgent({ url, token, store, message }) {
  const current = store.read();
  const latest = current.activePlan ? current.plans.find(plan => plan.id === current.activePlan) : current.plans.at(-1);
  const parsed = parseMessage(message, latest?.status === 'proposed' && latest.baseRevision === current.revision && latest.expiresAt > Date.now() ? latest.preferences : current.preferences);
  const trace = [];
  if (parsed.intent === 'unknown') return { text: 'I can replan pickup and dinner, change a budget or cooking time, exclude an unavailable helper, explain a plan, or recap saved changes. Try “Plan our evening under $8” or “Jo is unavailable, replan.” This demo uses a constrained planner, not a general-purpose language model.', trace, plan: null };
  if (parsed.intent === 'invalid') return { text: parsed.reason, trace, plan: null };
  const client = new Client({ name: 'relay-web-simulator', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  const call = async (name, args) => {
    const started = performance.now();
    const response = await client.callTool({ name, arguments: args });
    if (response.isError) throw new Error(response.content?.[0]?.text ?? 'Tool call failed.');
    const data = response.structuredContent ?? JSON.parse(response.content[0].text);
    trace.push({ name, args, durationMs: Math.round(performance.now() - started), status: 'complete' });
    return data;
  };
  try {
    await client.connect(transport);
    const started = performance.now();
    const discovery = await client.listTools();
    trace.push({ name: 'tools/list', args: {}, durationMs: Math.round(performance.now() - started), status: 'complete', detail: `${discovery.tools.length} tools discovered over Streamable HTTP` });
    const context = await call('household_context', {});
    if (parsed.intent === 'history') {
      const latestPlan = context.latestPlan;
      let planText = '';
      if (latestPlan?.status === 'proposed') {
        planText = latestPlan.baseRevision === context.revision && Date.now() < latestPlan.expiresAt
          ? `Your latest draft is not saved: ${latestPlan.summary} Budget $${latestPlan.preferences.budget.toFixed(2)}; pickup option: ${latestPlan.helper ?? 'none'}. Review it before confirming.`
          : 'Your last draft is stale or expired. Recheck the household before confirming a new plan.';
      } else if (context.activePlan && latestPlan?.status === 'committed') {
        planText = `Your local plan is saved: ${latestPlan.summary} Pickup still needs the helper’s acknowledgment; no message was sent.`;
      }
      const history = [...context.activity].reverse().slice(0, 2).map(item => item.text).join('\n');
      return { text: [planText, history && `Recent local changes:\n${history}`].filter(Boolean).join('\n') || 'No plan has been confirmed yet. The school notice, calendar and pantry are synthetic demo data. Preview a plan to see the trade-offs before saving anything.', trace, plan: null };
    }
    if (parsed.intent === 'explain') {
      const explainedPlan = context.latestPlan;
      if (!explainedPlan) return { text: 'Create a plan first, then I can explain every decision and rejected option.', trace, plan: null };
      const explanation = await call('explain_plan', { planId: explainedPlan.id });
      const rejected = explanation.candidates.filter(person => !person.eligible).map(person => `${person.name}: ${person.reasons.join('; ')}.`).join(' ');
      const warning = explainedPlan.status === 'proposed'
        ? explainedPlan.baseRevision !== context.revision
          ? 'This preview is stale because the household changed. Replan before confirming.'
          : Date.now() >= explainedPlan.expiresAt
            ? 'This preview has expired. Replan before confirming.'
            : ''
        : explainedPlan.status === 'committed' && context.activePlan === explainedPlan.id
          ? ''
          : 'This is a historical plan, not a current proposal. Replan before confirming.';
      return { text: [warning, explanation.summary, rejected, 'Meal choices are ranked by pantry coverage, then estimated cost. These are planning estimates, not live travel or store quotes.'].filter(Boolean).join(' '), trace, plan: latest?.id === explainedPlan.id ? latest : null };
    }
    if (context.activePlan) return { text: 'You have a saved plan. Undo it first to create a replacement without losing track of changes. The current pickup still requires the helper’s acknowledgment.', trace, plan: latest ?? null };
    const plan = await call('preview_evening', parsed.preferences);
    return { text: `${plan.summary} ${plan.blockers.length ? 'Review the blockers below.' : `Estimated grocery additions: $${plan.cost.toFixed(2)} against a $${plan.preferences.budget.toFixed(2)} cap. Review and confirm to save the local plan.`}`, trace, plan };
  } finally { await client.close(); }
}
