// Deterministic constraint checks. The agent may choose what to ask and in which order,
// but who is allowed at the school gate and what the budget permits is decided here, never by a model.
import { clock, GROCER } from './household.js';

export function pickupOptions(home, { exclude = [] } = {}) {
  const unavailable = new Set([...exclude, ...home.memory.declined.map(item => item.name)].map(name => name.toLowerCase()));
  return home.people.map(person => {
    const arrives = Math.max(home.now, person.free) + person.travel;
    const reasons = [];
    if (!person.approved) reasons.push('Not on the school pickup list');
    if (unavailable.has(person.name.toLowerCase())) reasons.push('Said no for this evening');
    if (arrives > home.pickup.deadline) reasons.push(`Would arrive ${arrives - home.pickup.deadline} min late (${clock(arrives)})`);
    return { name: person.name, role: person.role, pronouns: person.pronouns, approved: person.approved, arrives, arrivesLabel: clock(arrives), note: person.note, eligible: reasons.length === 0, reasons };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(b.role === 'Parent') - Number(a.role === 'Parent') || a.arrives - b.arrives);
}

export function dinnerOptions(home, { budget, maxMinutes, vegetarian = home.memory.vegetarian } = {}) {
  const left = Math.max(0, home.memory.weeklyGroceryCap - home.memory.spentThisWeek);
  const cap = budget === undefined ? left : Math.min(budget, left);
  const cook = home.people.find(person => person.name === home.dinner.cook);
  return home.meals.map(meal => {
    const missing = meal.needs.filter(item => !(home.pantry[item] > 0));
    const cost = Math.round(missing.reduce((sum, item) => sum + GROCER.prices[item], 0) * 100) / 100;
    const start = home.dinner.time - meal.minutes;
    const reasons = [];
    if (vegetarian && !meal.vegetarian) reasons.push('Not vegetarian');
    if (maxMinutes !== undefined && meal.minutes > maxMinutes) reasons.push(`Takes ${meal.minutes} min, over the ${maxMinutes} min limit`);
    if (cost > cap) reasons.push(`Needs $${cost.toFixed(2)} of groceries, over the $${cap.toFixed(2)} available`);
    if (!cook || cook.free > start) reasons.push(`${home.dinner.cook} is not free by ${clock(start)}`);
    return { id: meal.id, name: meal.name, minutes: meal.minutes, vegetarian: meal.vegetarian, fromPantry: meal.needs.length - missing.length, of: meal.needs.length, missing, cost, start, startLabel: clock(start), eligible: reasons.length === 0, reasons };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.fromPantry / b.of - a.fromPantry / a.of || a.cost - b.cost);
}

// One evening plan: who collects the child, what is for dinner, what has to be bought. Nothing is acted on here.
export function drawPlan(home, constraints = {}) {
  const people = pickupOptions(home, constraints);
  const meals = dinnerOptions(home, constraints);
  const helper = people.find(person => person.eligible) ?? null;
  // A named meal is used if it fits; otherwise the best-ranked one that does.
  const wanted = constraints.meal && meals.find(option => option.eligible && (option.id === constraints.meal || option.name.toLowerCase().includes(String(constraints.meal).toLowerCase())));
  const meal = wanted || (meals.find(option => option.eligible) ?? null);
  const blockers = [];
  if (!helper) blockers.push('Nobody on the school pickup list can be there by ' + clock(home.pickup.deadline) + '. Call the school or an approved adult; Relay will not suggest anyone else.');
  if (!meal) blockers.push('No dinner fits the time, diet and grocery limits. Relax one of them and ask again.');
  return {
    revision: home.revision,
    constraints: { budget: constraints.budget ?? null, maxMinutes: constraints.maxMinutes ?? null, exclude: constraints.exclude ?? [], meal: constraints.meal ?? null },
    pickup: helper && { who: helper.name, role: helper.role, arrivesLabel: helper.arrivesLabel, by: clock(home.pickup.deadline), where: home.pickup.location },
    dinner: meal && { id: meal.id, name: meal.name, startLabel: meal.startLabel, minutes: meal.minutes, cook: home.dinner.cook, readyBy: clock(home.dinner.time), missing: meal.missing, cost: meal.cost },
    people, meals, blockers,
    summary: blockers.length ? blockers.join(' ')
      : `${helper.name} can be at the gate by ${helper.arrivesLabel}. ${home.dinner.cook} starts ${meal.name.toLowerCase()} at ${meal.startLabel}` + (meal.missing.length ? `, with ${meal.missing.join(' and ')} to buy ($${meal.cost.toFixed(2)}).` : ', all from the pantry.')
  };
}

// The stored plan together with what has happened since it was drawn: was the helper asked, did they answer, was the food bought.
export function planNow(home) {
  if (!home.plan) return null;
  const plan = structuredClone(home.plan);
  if (plan.pickup) {
    const request = home.requests.findLast(item => item.name === plan.pickup.who && item.status !== 'withdrawn');
    plan.pickup.status = request?.status ?? 'not asked';
    // While the answer is open the plan carries the helper's reply link, so a card can show it as a code to scan.
    if (request?.status === 'awaiting reply' && request.replyUrl) plan.pickup.replyUrl = request.replyUrl;
    if (request?.via === 'link') plan.pickup.answeredVia = 'link';
  }
  if (plan.dinner) {
    const order = plan.dinner.missing.length ? home.orders.findLast(item => item.status === 'placed' && plan.dinner.missing.every(name => item.lines.some(line => line.name === name))) : null;
    plan.dinner.order = order ? { id: order.id, total: order.total, slotLabel: order.slotLabel } : null;
  }
  return plan;
}
