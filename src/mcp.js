import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DomainError, preview } from './planner.js';

const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });

export function createMcpServer(store) {
  const server = new McpServer({ name: 'relay-home', version: '0.1.0' });
  server.registerTool('household_context', {
    title: 'Read household context',
    description: 'Read synthetic household calendar, pickup permissions, pantry, constraints, latest draft or saved plan, local tasks and shopping. All data belongs to a local demo household.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async () => {
    const state = store.read();
    const latest = state.activePlan ? state.plans.find(plan => plan.id === state.activePlan) : state.plans.at(-1);
    const latestPlan = latest ? { id: latest.id, status: latest.status, baseRevision: latest.baseRevision, expiresAt: latest.expiresAt, preferences: latest.preferences, summary: latest.summary, helper: latest.helper, meal: latest.meal, cost: latest.cost, blockers: latest.blockers, steps: latest.steps } : null;
    return result({ revision: state.revision, source: 'synthetic-demo', date: state.date, pickup: state.pickup, people: state.people, pantry: state.pantry, dinner: state.dinner, preferences: state.preferences, activePlan: state.activePlan, latestPlan, tasks: state.tasks, shopping: state.shopping, activity: state.activity.slice(-5) });
  });
  server.registerTool('preview_evening', {
    title: 'Preview an evening plan',
    description: 'Evaluate pickup authorization and arrival times, calendar availability, pantry coverage, meal duration and grocery budget. Omitted constraints inherit the latest unexpired draft or saved household preferences. Stores a ten-minute draft for human review. Undo a saved plan before previewing a replacement. Cannot send messages, buy items, or confirm a plan. Blocked plans cannot be confirmed.',
    inputSchema: {
      budget: z.number().min(0).max(100).optional(),
      vegetarian: z.boolean().optional(),
      maxMinutes: z.number().int().min(1).max(120).optional(),
      excluded: z.array(z.enum(['Alex', 'Sam', 'Jo'])).max(3).optional()
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async options => result(store.update(state => {
    if (state.activePlan) throw new DomainError('Undo the saved plan before previewing a replacement.');
    const latestDraft = [...state.plans].reverse().find(item => item.status === 'proposed' && item.baseRevision === state.revision && item.expiresAt > Date.now());
    const plan = preview(state, { ...(latestDraft?.preferences ?? state.preferences), ...options });
    state.plans = [...state.plans.filter(item => item.status !== 'proposed').slice(-30), ...state.plans.filter(item => item.status === 'proposed').slice(-9), plan];
    return plan;
  })));
  server.registerTool('explain_plan', {
    title: 'Explain a decision', description: 'Return the evidence, rejected candidates, constraints and blockers of a stored plan.',
    inputSchema: { planId: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ planId }) => {
    const plan = store.read().plans.find(item => item.id === planId);
    if (!plan) return { isError: true, content: [{ type: 'text', text: 'Plan not found.' }] };
    return result({ planId, summary: plan.summary, candidates: plan.candidates, meals: plan.meals, blockers: plan.blockers, preferences: plan.preferences });
  });
  return server;
}
