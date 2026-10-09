// Everything that changes the household or spends money. Each function either succeeds completely or throws a Refusal.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { clock, GROCER, money } from './household.js';
import { drawPlan, pickupOptions } from './planner.js';

export class Refusal extends Error {}

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url');

// A sealed value travels through the client and comes back unchanged or not at all.
export const seal = (value, secret) => { const body = encode(value); return `${body}.${sign(body, secret)}`; };

export function unseal(token, secret) {
  const [body, mac] = String(token).split('.');
  const expected = Buffer.from(sign(body ?? '', secret));
  const given = Buffer.from(mac ?? '');
  if (!body || given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString());
}

function note(home, text, kind = 'info') {
  home.log.push({ at: new Date().toISOString(), kind, text });
  home.revision += 1;
}

export function savePlan(home, constraints) {
  home.plan = drawPlan(home, constraints);
  return home.plan;
}

// What the shop charges for these items in this slot. A quote and the order that follows are both built from this.
function price(items, slot) {
  const unknown = items.filter(item => GROCER.prices[item] === undefined);
  if (unknown.length) throw new Refusal(`${GROCER.name} does not sell: ${unknown.join(', ')}.`);
  if (!items.length) throw new Refusal('Nothing to buy: the pantry already covers this dinner.');
  const delivery = GROCER.slots.find(option => option.id === slot);
  if (!delivery) throw new Refusal(`Unknown slot. Choose one of: ${GROCER.slots.map(option => option.id).join(', ')}.`);
  const lines = [...new Set(items)].map(name => ({ name, price: GROCER.prices[name] }));
  const subtotal = Math.round(lines.reduce((sum, line) => sum + line.price, 0) * 100) / 100;
  return { shop: GROCER.name, lines, subtotal, fee: delivery.fee, total: Math.round((subtotal + delivery.fee) * 100) / 100, slot: delivery.id, slotLabel: delivery.label };
}
const mac16 = (body, secret) => createHmac('sha256', secret).update(body).digest().subarray(0, 16).toString('base64url');

// A quote fixes the items, the slot and the total. The token is signed, so a later order cannot be for anything else.
// A model has to copy the token from one call into the next, so it carries only what cannot be recomputed (id,
// items, slot, total in cents, expiry) and a 128-bit MAC: about ninety characters. Long tokens get corrupted in transit.
export function quoteGroceries(home, { items, slot = GROCER.slots[0].id }, secret, now = Date.now()) {
  const quote = { id: randomUUID().slice(0, 13).replace('-', ''), ...price(items, slot), expires: (Math.floor(now / 1000) + 600) * 1000 };
  const body = encode([quote.id, quote.lines.map(line => line.name), quote.slot, Math.round(quote.total * 100), quote.expires / 1000]);
  const left = Math.round((home.memory.weeklyGroceryCap - home.memory.spentThisWeek) * 100) / 100;
  return { ...quote, token: `${body}.${mac16(body, secret)}`, leftThisWeek: left, withinCap: quote.total <= left };
}

export function readQuote(token, secret, now = Date.now()) {
  const [body, mac] = String(token).split('.');
  const expected = Buffer.from(mac16(body ?? '', secret));
  const given = Buffer.from(mac ?? '');
  if (!body || given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Refusal('This quote was not issued by Relay or has been altered.');
  const [id, items, slot, cents, until] = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (now > until * 1000) throw new Refusal('This quote has expired. Ask for a fresh one.');
  const quote = { id, ...price(items, slot), expires: until * 1000 };
  if (Math.round(quote.total * 100) !== cents) throw new Refusal('The shop\'s prices have changed since this quote. Ask for a fresh one.');
  return quote;
}

// Called only after the person has confirmed the exact total. `key` makes a repeated call return the same order.
export function placeOrder(home, quote, { confirmedTotal, key }) {
  const earlier = home.orders.find(order => order.key === key);
  if (earlier) return { ...earlier, repeated: true };
  if (confirmedTotal !== quote.total) throw new Refusal(`The confirmed amount (${money(confirmedTotal)}) is not the quoted total (${money(quote.total)}).`);
  if (home.orders.some(order => order.quote === quote.id && order.status === 'placed')) throw new Refusal('This quote has already been ordered.');
  const left = home.memory.weeklyGroceryCap - home.memory.spentThisWeek;
  if (quote.total > left + 1e-9) throw new Refusal(`${money(quote.total)} is over what is left of this week's grocery cap (${money(left)}). Raise the cap yourself or pick a cheaper dinner.`);
  const order = { id: 'R-' + randomUUID().slice(0, 8).toUpperCase(), key, quote: quote.id, shop: quote.shop, lines: quote.lines, fee: quote.fee, total: quote.total, slotLabel: quote.slotLabel, status: 'placed', placedAt: new Date().toISOString() };
  home.orders.push(order);
  home.memory.spentThisWeek = Math.round((home.memory.spentThisWeek + quote.total) * 100) / 100;
  note(home, `Ordered ${quote.lines.map(line => line.name).join(', ')} from ${quote.shop} for ${money(quote.total)} (${quote.slotLabel}).`, 'order');
  return order;
}

export function cancelOrder(home, id) {
  const order = home.orders.find(item => item.id === id);
  if (!order) throw new Refusal('No such order.');
  if (order.status !== 'placed') return order;
  order.status = 'cancelled';
  home.memory.spentThisWeek = Math.round((home.memory.spentThisWeek - order.total) * 100) / 100;
  note(home, `Cancelled order ${order.id}; ${money(order.total)} returned to the weekly cap.`, 'order');
  return order;
}

// Records that the household asked someone to collect the child. Relay never treats this as "pickup is covered".
// `origin` is where this server can be reached from the helper's phone; the request then carries a private link
// that lets the helper, and only the helper, answer this one question.
export function requestPickup(home, name, { origin } = {}) {
  const person = pickupOptions(home).find(option => option.name.toLowerCase() === String(name).toLowerCase());
  if (!person) throw new Refusal(`Relay does not know anyone called ${name}.`);
  if (!person.eligible) throw new Refusal(`${person.name} cannot be asked: ${person.reasons.map(reason => reason[0].toLowerCase() + reason.slice(1)).join('; ')}.`);
  const open = home.requests.find(request => request.status === 'awaiting reply');
  if (open) throw new Refusal(`${open.name} has already been asked and has not answered. Record their answer or withdraw that request first.`);
  const code = randomBytes(9).toString('base64url');
  const request = { id: 'P-' + randomUUID().slice(0, 8).toUpperCase(), name: person.name, by: clock(home.pickup.deadline), where: home.pickup.location, status: 'awaiting reply', askedAt: new Date().toISOString(), code, replyUrl: `${origin ?? ''}/r/${code}` };
  home.requests.push(request);
  note(home, `Asked ${person.name} to collect ${home.child} at ${request.where} by ${request.by}. Waiting for their answer.`, 'pickup');
  return request;
}

export function recordReply(home, id, accepted) {
  const request = home.requests.find(item => item.id === id);
  if (!request) throw new Refusal('No such pickup request.');
  // A helper who said yes can still drop out later; that is the one answer that may change.
  if (request.status === 'confirmed' && !accepted) {
    request.status = 'declined';
    home.memory.declined.push({ name: request.name, date: home.date });
    note(home, `${request.name} had confirmed but cannot do it after all. The pickup is no longer covered.`, 'pickup');
    return request;
  }
  if (request.status !== 'awaiting reply') throw new Refusal(`${request.name} already answered: ${request.status}.`);
  request.status = accepted ? 'confirmed' : 'declined';
  if (!accepted) home.memory.declined.push({ name: request.name, date: home.date });
  note(home, accepted ? `${request.name} confirmed the pickup.` : `${request.name} cannot do it. They are left out of new plans for today.`, 'pickup');
  return request;
}

// The helper's answer, from either side: told to Relay by the household, or given by the helper through their link
// (`via: 'link'`). After a "no" the stored draft would still name that person, so it is drawn again with the same
// limits. Returns the request and one sentence that says where the evening stands now.
export function answerRequest(home, id, accepted, { via = 'household' } = {}) {
  const request = recordReply(home, id, accepted);
  request.via = via;
  request.answeredAt = new Date().toISOString();
  if (!accepted && home.plan) savePlan(home, Object.fromEntries(Object.entries(home.plan.constraints).filter(([, value]) => value != null && !(Array.isArray(value) && !value.length))));
  const next = home.plan?.pickup;
  const outcome = accepted ? `${request.name} confirmed. The pickup is covered.`
    : `${request.name} cannot do it and is left out for today. ` + (!home.plan ? 'Nobody is covering the pickup.' : next ? `${next.who} is on the school list and could be there by ${next.arrivesLabel}; nobody has asked ${next.who} yet.` : home.plan.blockers[0]);
  // An answer that arrives through the link happens outside the conversation, so the screen has to announce it.
  if (via === 'link') Object.assign(home.log.at(-1), { via, announce: outcome });
  return { request, outcome };
}

export const requestByCode = (home, code) => home.requests.find(request => request.code === code) ?? null;

export function withdrawRequest(home, id) {
  const request = home.requests.find(item => item.id === id);
  if (!request) throw new Refusal('No such pickup request.');
  if (request.status !== 'awaiting reply') throw new Refusal(`That request is already ${request.status}.`);
  request.status = 'withdrawn';
  note(home, `Withdrew the pickup request to ${request.name}.`, 'pickup');
  return request;
}

export function remember(home, { vegetarian, weeklyGroceryCap }) {
  if (vegetarian !== undefined) home.memory.vegetarian = vegetarian;
  if (weeklyGroceryCap !== undefined) home.memory.weeklyGroceryCap = weeklyGroceryCap;
  note(home, `Preferences updated: ${home.memory.vegetarian ? 'vegetarian' : 'no diet limit'}, weekly grocery cap ${money(home.memory.weeklyGroceryCap)}.`, 'memory');
  return home.memory;
}
