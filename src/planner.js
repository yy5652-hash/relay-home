import { randomUUID } from 'node:crypto';

export function fixture() {
  return {
    revision: 1,
    scenario: 'rain',
    date: '2026-10-02',
    now: 16 * 60 + 40,
    pickup: { title: 'Mia · after-school pickup', deadline: 17 * 60 + 15, original: 'Alex', location: 'Oakfield School' },
    people: [
      { id: 'alex', name: 'Alex', available: 18 * 60 + 10, travel: 15, authorized: true, role: 'Parent', source: 'Demo calendar · train delay' },
      { id: 'sam', name: 'Sam', available: 17 * 60, travel: 20, authorized: true, role: 'Parent', source: 'Demo calendar · client call until 5:00' },
      { id: 'jo', name: 'Jo', available: 16 * 60 + 45, travel: 15, authorized: true, role: 'Trusted neighbor', source: 'Demo household · approved pickup helper' },
      { id: 'lee', name: 'Lee', available: 16 * 60 + 40, travel: 10, authorized: false, role: 'Neighbor', source: 'Demo household · not on approved pickup list' }
    ],
    pantry: [ { name: 'pasta', quantity: 1 }, { name: 'tomatoes', quantity: 1 }, { name: 'chickpeas', quantity: 1 }, { name: 'rice', quantity: 1 } ],
    meals: [
      { id: 'pasta', name: 'Tomato & chickpea pasta', minutes: 25, vegetarian: true, ingredients: ['pasta', 'tomatoes', 'chickpeas', 'spinach'], prices: { spinach: 3.2 } },
      { id: 'rice', name: 'Garden rice bowls', minutes: 30, vegetarian: true, ingredients: ['rice', 'broccoli', 'tofu'], prices: { broccoli: 2.8, tofu: 3.9 } },
      { id: 'soup', name: 'Chickpea tomato soup', minutes: 20, vegetarian: true, ingredients: ['chickpeas', 'tomatoes'], prices: {} }
    ],
    dinner: { time: 18 * 60 + 30, cook: 'Sam' },
    events: [ { id: 'rain', title: 'Practice moved indoors. Earlier pickup.', detail: 'Mia now needs pickup at 5:15 PM. Alex’s delayed train arrives at 6:10 PM.', source: 'Synthetic school notice + calendar', time: '4:40 PM' } ],
    plans: [],
    activePlan: null,
    tasks: [],
    shopping: [],
    activity: [],
    messages: [],
    preferences: { budget: 12, vegetarian: true, excluded: [], maxMinutes: 30 }
  };
}

export function clockLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

export function preview(state, options = {}, now = Date.now()) {
  const preferences = { ...state.preferences, ...options };
  const candidates = state.people.map(person => {
    const arrival = Math.max(state.now, person.available) + person.travel;
    const reasons = [];
    if (!person.authorized) reasons.push('Not on the approved pickup list');
    if (preferences.excluded.some(name => name.toLowerCase() === person.name.toLowerCase())) reasons.push('Unavailable for this plan');
    if (arrival > state.pickup.deadline) reasons.push(`Arrives ${arrival - state.pickup.deadline} minutes after pickup`);
    return { ...person, arrival, eligible: reasons.length === 0, reasons };
  });
  const helper = candidates.filter(person => person.eligible).sort((left, right) => Number(right.role === 'Parent') - Number(left.role === 'Parent') || left.arrival - right.arrival)[0];
  const meals = state.meals.map(meal => {
    const missing = meal.ingredients.filter(ingredient => !state.pantry.some(item => item.name === ingredient && item.quantity > 0));
    const cost = Math.round(missing.reduce((total, ingredient) => total + (meal.prices[ingredient] ?? Infinity), 0) * 100) / 100;
    const reasons = [];
    if (preferences.vegetarian && !meal.vegetarian) reasons.push('Does not match vegetarian preference');
    if (meal.minutes > preferences.maxMinutes) reasons.push('Exceeds cooking time limit');
    if (cost > preferences.budget) reasons.push('Exceeds grocery budget');
    const cook = state.people.find(person => person.name === state.dinner.cook);
    if (!cook || cook.available > state.dinner.time - meal.minutes) reasons.push('Cook is unavailable at the required start time');
    return { ...meal, missing, cost, reasons, eligible: reasons.length === 0, pantryCount: meal.ingredients.length - missing.length };
  });
  const meal = meals.filter(item => item.eligible).sort((left, right) => right.pantryCount - left.pantryCount || left.cost - right.cost)[0];
  const blockers = [];
  if (!helper) blockers.push('No approved helper can arrive on time. Contact the school or an approved caregiver yourself; Relay will not assign an unapproved person.');
  if (!meal) blockers.push('No meal meets all current constraints. Increase the budget or cooking time, then try again.');
  const steps = [];
  if (helper) steps.push({ id: 'pickup', time: state.pickup.deadline, title: `Ask ${helper.name} to pick up Mia`, owner: helper.name, detail: `${state.pickup.location} · arrive by ${clockLabel(state.pickup.deadline)}`, status: 'awaiting acknowledgment', reason: `${helper.name} is approved and can arrive ${state.pickup.deadline - helper.arrival} minutes early. This is a local handoff draft; no message has been sent.` });
  if (meal) steps.push({ id: 'dinner', time: state.dinner.time - meal.minutes, title: `Make ${meal.name.toLowerCase()}`, owner: state.dinner.cook, detail: `${meal.minutes} minutes · dinner at ${clockLabel(state.dinner.time)}`, status: 'planned', reason: `${meal.pantryCount} ingredients already in the pantry; $${meal.cost.toFixed(2)} estimated additions. Pantry quantities are demo portions; verify stock before cooking.` });
  return {
    id: randomUUID(), baseRevision: state.revision, createdAt: now, expiresAt: now + 10 * 60_000,
    status: 'proposed', preferences, candidates, meals, helper: helper?.name ?? null, meal: meal?.name ?? null,
    cost: meal?.cost ?? 0, steps, blockers,
    shopping: meal ? meal.missing.map(name => ({ name, price: meal.prices[name], checked: false })) : [],
    summary: blockers.length ? 'This evening needs a human decision.' : `${helper.name} is an approved on-time pickup option, pending acknowledgment. ${state.dinner.cook} can make ${meal.name.toLowerCase()} by ${clockLabel(state.dinner.time)}.`
  };
}

export class DomainError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}

export function commit(state, planId, now = Date.now()) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan) throw new DomainError('Plan not found. Create a fresh plan.', 404);
  if (plan.status === 'committed' && state.activePlan === plan.id) return { duplicate: true, plan };
  if (plan.status !== 'proposed') throw new DomainError('This plan is no longer open. Create a fresh plan.');
  if (now >= plan.expiresAt) throw new DomainError('This plan expired. Recheck the household before confirming.');
  if (plan.baseRevision !== state.revision) throw new DomainError('The household changed. Replan before confirming.');
  if (state.activePlan) throw new DomainError('Undo the current plan before confirming a replacement.');
  if (plan.blockers.length) throw new DomainError('Resolve the blockers before confirming.');
  plan.before = { tasks: structuredClone(state.tasks), shopping: structuredClone(state.shopping), preferences: structuredClone(state.preferences) };
  state.tasks = structuredClone(plan.steps);
  state.shopping = structuredClone(plan.shopping);
  state.preferences = structuredClone(plan.preferences);
  state.activePlan = plan.id;
  plan.status = 'committed';
  for (const other of state.plans) if (other.id !== plan.id && other.status === 'proposed') other.status = 'superseded';
  state.revision += 1;
  plan.committedRevision = state.revision;
  state.activity.push({ id: randomUUID(), type: 'confirmed', at: new Date(now).toISOString(), text: 'Plan saved locally. Pickup still needs the helper’s acknowledgment. No messages, purchases, or device actions were sent.' });
  return { duplicate: false, plan };
}

export function undo(state, planId, now = Date.now()) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan) throw new DomainError('Plan not found.', 404);
  if (plan.status === 'undone') return { duplicate: true };
  if (state.activePlan !== planId || plan.status !== 'committed') throw new DomainError('Only the active plan can be undone.');
  if (state.revision !== plan.committedRevision) throw new DomainError('The household changed after confirmation. Review those changes before undoing.');
  state.tasks = structuredClone(plan.before.tasks);
  state.shopping = structuredClone(plan.before.shopping);
  state.preferences = structuredClone(plan.before.preferences);
  state.activePlan = null;
  plan.status = 'undone';
  state.revision += 1;
  state.activity.push({ id: randomUUID(), type: 'undone', at: new Date(now).toISOString(), text: 'Local plan and shopping list restored to their previous state.' });
  return { duplicate: false };
}

export function declinePickup(state, planId, now = Date.now()) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan) throw new DomainError('Plan not found.', 404);
  if (plan.status === 'declined') return { duplicate: true, helper: plan.helper };
  if (state.activePlan !== planId || plan.status !== 'committed') throw new DomainError('Only the active plan can receive a pickup response.');
  if (state.revision !== plan.committedRevision) throw new DomainError('The household changed after confirmation. Review those changes before replanning.');
  if (!plan.helper || !state.tasks.some(task => task.id === 'pickup' && task.status === 'awaiting acknowledgment')) throw new DomainError('There is no pending pickup response to record.');
  state.tasks = structuredClone(plan.before.tasks);
  state.shopping = structuredClone(plan.before.shopping);
  state.preferences = { ...structuredClone(plan.preferences), excluded: [...new Set([...plan.preferences.excluded, plan.helper])] };
  state.activePlan = null;
  plan.status = 'declined';
  state.revision += 1;
  state.activity.push({ id: randomUUID(), type: 'pickup-declined', at: new Date(now).toISOString(), text: `You recorded that ${plan.helper} cannot cover pickup. The local plan was restored and ${plan.helper} is excluded from the next proposal. No message was sent.` });
  return { duplicate: false, helper: plan.helper };
}

export function changeScenario(state, scenario) {
  if (state.activePlan) throw new DomainError('Undo the active plan before changing the demo scenario.');
  const source = fixture();
  if (scenario === 'no-helper') {
    source.people.find(person => person.id === 'jo').available = 18 * 60;
    source.events.push({ id: 'jo-away', title: 'Jo is unavailable this afternoon.', detail: 'The approved backup cannot make pickup. Test how Relay handles an unresolved conflict.', source: 'Synthetic household update', time: '4:41 PM' });
  } else if (scenario === 'early-sam') {
    source.people.find(person => person.id === 'sam').available = 16 * 60 + 45;
    source.people.find(person => person.id === 'sam').source = 'Demo calendar · meeting ended early';
    source.events.push({ id: 'sam-free', title: 'Sam’s meeting ended early.', detail: 'A parent is available from 4:45 PM. Re-evaluate the pickup options.', source: 'Synthetic calendar update', time: '4:41 PM' });
  } else if (scenario !== 'rain') throw new DomainError('Unknown scenario.', 400);
  state.people = source.people;
  state.events = source.events;
  state.scenario = scenario;
  state.revision += 1;
}

export function parseMessage(message, currentPreferences) {
  const text = message.trim().toLowerCase().replace(/[‘’]/g, "'");
  if (/\b(why|explain|reason)\b/.test(text)) return { intent: 'explain' };
  if (/\b(what changed|history|recap|remember)\b/.test(text)) return { intent: 'history' };
  const namedAvailability = /\b(?:jo|sam|alex)\s+(?:is\s+)?(?:not\s+)?available\b/.test(text);
  const supported = namedAvailability || /\b(plan|replan|evening|dinner|pickup|pick up|budget|under|vegetarian|minutes|unavailable|cannot|can't)\b/.test(text);
  if (!supported) return { intent: 'unknown' };
  const preferences = structuredClone(currentPreferences);
  const budgetPhrase = text.match(/(?:under|budget(?: of| is)?|less than|max(?:imum)?)\s*(?:\$\s*)?(\S+)/);
  const budgetToken = budgetPhrase && /^[\d.-]/.test(budgetPhrase[1]) ? budgetPhrase[1] : text.match(/\$\s*(\S+)/)?.[1];
  if (budgetToken) {
    const amount = budgetToken.replace(/[.,!?;:]+$/, '').replace('$', '');
    if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(amount) || Number(amount) > 100) return { intent: 'invalid', reason: 'Use a budget from $0 to $100, with no more than two decimal places. Nothing was planned.' };
    preferences.budget = Number(amount);
  }
  const duration = text.match(/(\S+)\s*(?:minutes?|mins?)\b/);
  if (duration) {
    if (!/^\d+$/.test(duration[1]) || Number(duration[1]) < 1 || Number(duration[1]) > 120) return { intent: 'invalid', reason: 'Use a whole-number cooking time from 1 to 120 minutes. Nothing was planned.' };
    preferences.maxMinutes = Number(duration[1]);
  }
  for (const name of ['Jo', 'Sam', 'Alex']) {
    if (new RegExp(`\\b${name.toLowerCase()}\\s+(?:is\\s+)?(?:unavailable|cannot|can't|not available)\\b`).test(text)) preferences.excluded = [...new Set([...preferences.excluded, name])];
    if (new RegExp(`\\b${name.toLowerCase()}\\s+(?:is\\s+)?available\\b`).test(text)) preferences.excluded = preferences.excluded.filter(item => item !== name);
  }
  return { intent: 'plan', preferences };
}
