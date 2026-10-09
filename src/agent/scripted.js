// A model that needs no key: it follows the skill's procedure with plain rules, so the demo and the tests run
// anywhere. It sees exactly what a language model would see (the conversation and the tool list) and answers in the
// same shape, so swapping in a hosted model changes nothing else.
import { randomUUID } from 'node:crypto';

const money = amount => `$${Number(amount).toFixed(2)}`;
const call = (name, args = {}) => ({ id: randomUUID().slice(0, 8), name, args });

function limits(text) {
  const out = {};
  const dollars = /(?:under|below|max(?:imum)?|at most|less than|within)?\s*\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:dollars|bucks)/i.exec(text);
  if (dollars) out.budget = Number(dollars[1] ?? dollars[2]);
  const minutes = /(\d+)\s*(?:min|minutes)/i.exec(text);
  if (minutes) out.maxMinutes = Number(minutes[1]);
  const without = /(?:without|not|except|leave out)\s+(alex|sam|jo|lee)/i.exec(text);
  if (without) out.exclude = [without[1][0].toUpperCase() + without[1].slice(1).toLowerCase()];
  const meal = /(pasta|soup|rice bowls?|bowls|chicken)/i.exec(text);
  if (meal) out.meal = meal[1].toLowerCase().replace('rice bowls', 'bowls').replace('rice bowl', 'bowls');
  return out;
}

function intent(text, notes) {
  const t = text.toLowerCase();
  const name = /\b(alex|sam|jo|lee)\b/i.exec(text)?.[1];
  const who = name && name[0].toUpperCase() + name.slice(1).toLowerCase();
  if (/\b(can'?t|cannot|can not|won'?t|said no|says no|declined|isn'?t available|is not available|unavailable)\b/.test(t) && who) return { kind: 'reply', who, accepted: false };
  if (/\b(confirmed|said yes|says yes|can do it|will do it|accepted|is on (his|her|their) way)\b/.test(t) && who) return { kind: 'reply', who, accepted: true };
  if (/\bcancel\b.*\border\b/.test(t)) return { kind: 'cancel' };
  if (/\b(remember|recap|what happened|where are we|status)\b/.test(t)) return { kind: 'recap' };
  if (/\bweekly\b|\bcap\b|a week\b/.test(t) && /\$\s*\d+|\d+\s*dollars/.test(t)) return { kind: 'cap', amount: limits(text).budget };
  if (/\b(order|buy|get the groceries|purchase)\b/.test(t)) return { kind: 'order', ...limits(text) };
  if (/\bask\b/.test(t) && who) return { kind: 'ask', who };
  if (/^(yes|yeah|yep|ok|okay|sure|please do|go ahead|do it)\b/.test(t.trim())) return notes.offer ? { kind: notes.offer.kind, who: notes.offer.who } : { kind: 'plan' };
  if (/^(no|not now|leave it|never mind)\b/.test(t.trim())) return { kind: 'decline' };
  const asked = limits(text);
  if (!Object.keys(asked).length && !/\b(pick ?up|collect|plan|evening|tonight|dinner|late|moved|changed|who can|cook|eat|again)\b/.test(t)) return { kind: 'help' };
  return { kind: 'plan', ...asked };
}

// Why the meal the person named is not the one in the plan, in the server's own words.
function notChosen(plan, meal) {
  if (!meal || !plan?.meals || plan.dinner?.id === meal) return '';
  const option = plan.meals.find(item => item.id === meal);
  return option && !option.eligible ? `${option.name} will not work tonight: ${option.reasons.map(reason => reason[0].toLowerCase() + reason.slice(1)).join('; ')}.` : '';
}

// What happened since the person last spoke: the tool results of this turn, by tool name.
function thisTurn(messages) {
  const start = messages.map(message => message.role).lastIndexOf('user');
  const seen = {};
  for (const message of messages.slice(start + 1)) if (message.role === 'tool') for (const result of message.results) seen[result.name] = result;
  return { text: messages[start].text, seen };
}

export class ScriptedModel {
  name = 'scripted (no key needed)';

  async next({ conversation }) {
    const { notes } = conversation;
    const { text, seen } = thisTurn(conversation.messages);
    const want = notes.intent && notes.intentFor === text ? notes.intent : (notes.intent = intent(text, notes), notes.intentFor = text, notes.intent);
    const failed = Object.values(seen).find(result => result.error);
    if (failed && !['ask_helper', 'place_grocery_order'].includes(failed.name)) return { text: failed.summary };
    const home = seen.get_household?.data;

    if (want.kind === 'help') return { text: 'I can rebuild this evening when something changes. Tell me what happened, for example "the pickup moved to 5:15, keep dinner under $8". I check who may collect Mia and what dinner fits, and I ask you before I contact anyone or buy anything.' };

    if (want.kind === 'decline') { notes.offer = null; return { text: 'All right, I will leave it as it is.' }; }

    if (want.kind === 'recap') {
      if (!home) return { calls: [call('get_household')] };
      const open = home.requests.find(request => request.status === 'awaiting reply');
      const covered = home.requests.find(request => request.status === 'confirmed');
      const order = home.orders.findLast(item => item.status === 'placed');
      const refused = home.requests.findLast(request => request.status === 'declined');
      const lines = [
        covered ? `${covered.name} has confirmed the pickup.` : open ? `${open.name} has been asked about the pickup and has not answered yet.` : refused ? `${refused.name} said no, so nobody is covering the pickup yet.` : 'Nobody has been asked about the pickup yet.',
        home.plan?.dinner ? `Dinner is ${home.plan.dinner.name.toLowerCase()}; ${home.plan.dinner.cook} starts at ${home.plan.dinner.startLabel}.` : 'There is no dinner plan yet.',
        order ? `I ordered ${order.lines.map(line => line.name).join(' and ')} for ${money(order.total)}.` : 'Nothing has been ordered.',
        `${money(home.memory.weeklyGroceryCap - home.memory.spentThisWeek)} is left of this week's grocery cap.`
      ];
      return { text: lines.join(' ') };
    }

    if (want.kind === 'cap') {
      if (!seen.update_preferences) return { calls: [call('update_preferences', { weeklyGroceryCap: want.amount })] };
      if (seen.update_preferences.data?.done === false) return { text: 'Understood, the cap stays as it is.' };
      return { text: seen.update_preferences.summary.replace('Confirmed and done: ', 'Remembered: ') };
    }

    if (want.kind === 'cancel') {
      if (!home) return { calls: [call('get_household')] };
      const order = home.orders.findLast(item => item.status === 'placed');
      if (!order) return { text: 'There is no open order to cancel.' };
      if (!seen.cancel_grocery_order) return { calls: [call('cancel_grocery_order', { orderId: order.id })] };
      if (seen.cancel_grocery_order.data?.done === false) return { text: 'Understood, the order stays.' };
      return { text: `Order ${order.id} is cancelled. ${money(order.total)} is back in this week's cap.` };
    }

    if (want.kind === 'reply') {
      if (!home) return { calls: [call('get_household')] };
      const request = home.requests.findLast(item => item.name === want.who && (item.status === 'awaiting reply' || (item.status === 'confirmed' && !want.accepted)));
      if (!request && !seen.record_helper_reply) return { text: `I have no open request to ${want.who}. Ask me to plan the evening and I will check who can make it.` };
      if (!seen.record_helper_reply) return { calls: [call('record_helper_reply', { requestId: request.id, accepted: want.accepted })] };
      if (want.accepted) { notes.offer = null; return { text: `Good. ${want.who} has confirmed, so the pickup is covered.` }; }
      if (!seen.draft_evening_plan) return { calls: [call('draft_evening_plan', notes.limits ?? {})] };
      return this.#present(seen.draft_evening_plan.data.plan, notes, `${want.who} is out for today.`);
    }

    if (want.kind === 'ask') {
      const who = want.who ?? notes.plan?.pickup?.who;
      if (!who) return { text: 'There is nobody I can ask yet. Shall I plan the evening first?' };
      if (!seen.ask_helper) return { calls: [call('ask_helper', { name: who })] };
      if (seen.ask_helper.data?.done === false) return { text: `Understood, I have not asked ${who}.` };
      if (seen.ask_helper.error) return { text: seen.ask_helper.summary };
      const missing = notes.plan?.dinner?.missing ?? [];
      notes.offer = missing.length ? { kind: 'order' } : null;
      return { text: `${who} has been asked. The code on the screen opens ${who}'s own reply link, and I will count the pickup as covered once ${who} answers.` + (missing.length ? ` Shall I also order the ${missing.join(' and ')}?` : '') };
    }

    if (want.kind === 'order') {
      if ((want.meal || want.budget !== undefined || want.maxMinutes !== undefined) && !seen.draft_evening_plan) {
        notes.limits = { ...notes.limits, ...Object.fromEntries(Object.entries(want).filter(([key]) => ['budget', 'maxMinutes', 'meal'].includes(key))) };
        return { calls: [call('draft_evening_plan', notes.limits)] };
      }
      const plan = seen.draft_evening_plan?.data.plan ?? notes.plan;
      if (!plan?.dinner) return { text: 'There is no dinner plan to shop for yet. Shall I plan the evening first?' };
      notes.plan = plan;
      const unfit = notChosen(plan, notes.limits?.meal);
      if (unfit) { delete notes.limits.meal; return { text: `${unfit} Nothing was ordered; dinner stays ${plan.dinner.name.toLowerCase()}.` }; }
      if (!plan.dinner.missing.length) return { text: `Nothing to buy: ${plan.dinner.name.toLowerCase()} comes entirely from the pantry.` };
      if (!seen.quote_groceries) return { calls: [call('quote_groceries', { items: plan.dinner.missing })] };
      if (!seen.place_grocery_order) return { calls: [call('place_grocery_order', { quoteToken: seen.quote_groceries.data.quoteToken, orderKey: `evening-${randomUUID().slice(0, 8)}` })] };
      if (seen.place_grocery_order.data?.done === false) return { text: 'Understood, nothing was ordered.' };
      if (seen.place_grocery_order.error) return { text: seen.place_grocery_order.summary };
      const order = seen.place_grocery_order.data.order;
      notes.offer = null;
      return { text: `Ordered: ${order.lines.map(line => line.name).join(' and ')} for ${money(order.total)}. ${order.slotLabel}.` };
    }

    // Plan the evening: read, look up both halves together, draft, then offer the next step.
    if (!home) return { calls: [call('get_household')] };
    const asked = Object.fromEntries(Object.entries(want).filter(([key]) => ['budget', 'maxMinutes', 'exclude', 'meal'].includes(key)));
    notes.limits = { ...notes.limits, ...asked };
    if (!seen.find_pickup_helpers) return { calls: [call('find_pickup_helpers', notes.limits.exclude ? { exclude: notes.limits.exclude } : {}), call('suggest_dinners', Object.fromEntries(Object.entries(notes.limits).filter(([key]) => ['budget', 'maxMinutes'].includes(key))))] };
    if (!seen.draft_evening_plan) return { calls: [call('draft_evening_plan', notes.limits)] };
    const unfit = notChosen(seen.draft_evening_plan.data.plan, notes.limits.meal);
    if (unfit) delete notes.limits.meal;
    return this.#present(seen.draft_evening_plan.data.plan, notes, unfit);
  }

  #present(plan, notes, lead = '') {
    notes.plan = plan;
    if (!plan.pickup) { notes.offer = null; return { text: [lead, plan.blockers[0], plan.dinner ? `Dinner can still be ${plan.dinner.name.toLowerCase()} at ${plan.dinner.readyBy}.` : ''].filter(Boolean).join(' ') }; }
    notes.offer = { kind: 'ask', who: plan.pickup.who };
    const dinner = plan.dinner ? `${plan.dinner.cook} can start the ${plan.dinner.name.toLowerCase()} at ${plan.dinner.startLabel}` + (plan.dinner.missing.length ? `; ${plan.dinner.missing.join(' and ')} would cost ${money(plan.dinner.cost)}.` : ', all from the pantry.') : plan.blockers[0];
    return { text: [lead, `${plan.pickup.who} is on the school list and can be at the gate by ${plan.pickup.arrivesLabel}.`, dinner, `Shall I ask ${plan.pickup.who}?`].filter(Boolean).join(' ') };
  }
}
