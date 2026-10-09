import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newHousehold } from '../src/domain/household.js';
import { dinnerOptions, drawPlan, pickupOptions, planNow } from '../src/domain/planner.js';
import { cancelOrder, placeOrder, quoteGroceries, readQuote, recordReply, Refusal, requestPickup, savePlan } from '../src/domain/actions.js';

const SECRET = 'test-secret';

test('only an approved adult who is on time is offered for pickup', () => {
  const options = pickupOptions(newHousehold());
  assert.deepEqual(options.filter(option => option.eligible).map(option => option.name), ['Jo']);
  assert.match(options.find(option => option.name === 'Lee').reasons.join(), /not on the school pickup list/i);
  assert.match(options.find(option => option.name === 'Sam').reasons.join(), /5 min late/);
});

test('with nobody eligible the plan is blocked and names no one', () => {
  const plan = drawPlan(newHousehold(), { exclude: ['Jo'] });
  assert.equal(plan.pickup, null);
  assert.equal(plan.blockers.length, 1);
  assert.doesNotMatch(plan.summary, /Lee/);
});

test('dinner respects the pantry, the time limit and what is left of the weekly cap', () => {
  const home = newHousehold();
  assert.equal(dinnerOptions(home)[0].id, 'soup');                       // fully from the pantry
  assert.equal(dinnerOptions(home, { maxMinutes: 15 }).filter(meal => meal.eligible).length, 0);
  home.pantry.onion = 0; home.pantry.chickpeas = 0;
  const pasta = dinnerOptions(home).find(meal => meal.id === 'pasta');
  assert.deepEqual(pasta.missing, ['chickpeas', 'spinach']);
  assert.equal(pasta.cost, 4.5);
  home.memory.spentThisWeek = 38;                                         // $2 left this week
  assert.equal(dinnerOptions(home).find(meal => meal.id === 'pasta').eligible, false);
});

test('a quote cannot be altered and an order needs the exact confirmed total', () => {
  const home = newHousehold();
  const quote = quoteGroceries(home, { items: ['spinach'] }, SECRET);
  assert.equal(quote.total, 3.2);
  const [body, mac] = quote.token.split('.');
  const fields = JSON.parse(Buffer.from(body, 'base64url'));
  assert.equal(fields[3], 320);
  const forged = Buffer.from(JSON.stringify(fields.with(3, 1))).toString('base64url');   // the same quote for one cent
  assert.throws(() => readQuote(`${forged}.${mac}`, SECRET), Refusal);
  assert.throws(() => readQuote(quote.token, SECRET, quote.expires + 1), /expired/);
  // Short enough for a model to copy from one call into the next without damaging it.
  assert.ok(quote.token.length < 120, `token is ${quote.token.length} characters`);
  assert.throws(() => readQuote(quote.token.slice(0, -1) + (quote.token.endsWith('A') ? 'B' : 'A'), SECRET), Refusal);
  const read = readQuote(quote.token, SECRET);
  assert.throws(() => placeOrder(home, read, { confirmedTotal: 3, key: 'a' }), /not the quoted total/);
  const order = placeOrder(home, read, { confirmedTotal: 3.2, key: 'a' });
  assert.equal(home.memory.spentThisWeek, 24.6);
  assert.equal(placeOrder(home, read, { confirmedTotal: 3.2, key: 'a' }).id, order.id);   // same key, same order, charged once
  assert.equal(home.orders.length, 1);
  assert.throws(() => placeOrder(home, read, { confirmedTotal: 3.2, key: 'b' }), /already been ordered/);
  cancelOrder(home, order.id);
  assert.equal(home.memory.spentThisWeek, 21.4);
});

test('an order over the weekly cap is refused', () => {
  const home = newHousehold();
  home.memory.spentThisWeek = 39;
  const quote = quoteGroceries(home, { items: ['spinach'] }, SECRET);
  assert.equal(quote.withinCap, false);
  assert.throws(() => placeOrder(home, readQuote(quote.token, SECRET), { confirmedTotal: 3.2, key: 'k' }), /over what is left/);
  assert.equal(home.orders.length, 0);
});

test('a helper who declines is left out of the next plan', () => {
  const home = newHousehold();
  assert.throws(() => requestPickup(home, 'Lee'), /cannot be asked/);
  const request = requestPickup(home, 'Jo');
  assert.equal(request.status, 'awaiting reply');
  assert.throws(() => requestPickup(home, 'Jo'), /already been asked/);
  recordReply(home, request.id, false);
  const plan = drawPlan(home);
  assert.equal(plan.pickup, null);
  assert.match(plan.people.find(person => person.name === 'Jo').reasons.join(), /said no/i);
});

test('the stored plan reports what has happened since it was drawn', () => {
  const home = newHousehold();
  assert.equal(planNow(home), null);
  savePlan(home, { meal: 'pasta' });
  assert.equal(planNow(home).pickup.status, 'not asked');
  assert.equal(planNow(home).dinner.order, null);
  const request = requestPickup(home, 'Jo');
  assert.equal(planNow(home).pickup.status, 'awaiting reply');
  recordReply(home, request.id, true);
  assert.equal(planNow(home).pickup.status, 'confirmed');
  const quote = quoteGroceries(home, { items: planNow(home).dinner.missing }, SECRET);
  const order = placeOrder(home, readQuote(quote.token, SECRET), { confirmedTotal: quote.total, key: 'plan' });
  assert.equal(planNow(home).dinner.order.id, order.id);
  cancelOrder(home, order.id);
  assert.equal(planNow(home).dinner.order, null);
  // The stored draft itself is left as it was drawn.
  assert.equal(home.plan.pickup.status, undefined);
});

test('a helper who confirmed can still drop out, and then nobody is named', () => {
  const home = newHousehold();
  const request = requestPickup(home, 'Jo');
  recordReply(home, request.id, true);
  assert.throws(() => recordReply(home, request.id, true), /already answered/);
  recordReply(home, request.id, false);
  assert.equal(home.requests[0].status, 'declined');
  const plan = drawPlan(home);
  assert.equal(plan.pickup, null);
  assert.match(plan.blockers[0], /Nobody on the school pickup list/);
});

test('a reply link becomes a QR code a phone can read', async () => {
  const { qrCode } = await import('../src/domain/qr.js');
  const { createHash } = await import('node:crypto');
  const rows = qrCode('https://relay-home.onrender.com/r/lD49RGoYgWcQ');
  assert.equal(rows.length, 29);                                            // version 3
  assert.ok(rows.every(row => /^[01]{29}$/.test(row)));
  for (const [x, y] of [[0, 0], [22, 0], [0, 22]]) {                        // a finder pattern in three corners
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(line => rows[y + line].slice(x, x + 7)), ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111']);
  }
  // This exact symbol was read back with a phone-grade scanner (the browser's BarcodeDetector) when the encoder was
  // written, as were symbols of every size it produces; the digest keeps a later change from breaking it unnoticed.
  assert.equal(createHash('sha256').update(rows.join('\n')).digest('hex'), '10c9cc81b07448e0cfb07b5ad4257744e4b9899856889304c6875eb7279e13f3');
  assert.equal(qrCode('x'.repeat(106)).length, 37);                         // version 5 is the largest
  assert.equal(qrCode('x'.repeat(107)), null);
});
