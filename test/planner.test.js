import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, preview, commit, declinePickup, undo, changeScenario, parseMessage } from '../src/planner.js';
import { Store } from '../src/store.js';

function withPlan(options = {}) {
  const state = fixture();
  const plan = preview(state, options, 1000);
  state.plans.push(plan);
  return { state, plan };
}

test('rain disruption selects an approved on-time helper and a pantry-first meal', () => {
  const { state, plan } = withPlan();
  assert.equal(plan.helper, 'Jo');
  assert.equal(plan.cost, 3.2);
  assert.equal(plan.shopping.length, 1);
  assert.equal(plan.candidates.find(person => person.id === 'lee').eligible, false);
  assert.equal(plan.candidates.find(person => person.id === 'sam').reasons[0], 'Arrives 5 minutes after pickup');
  assert.equal(plan.meal, 'Tomato & chickpea pasta');
  assert.match(plan.summary, /pending acknowledgment/);
  assert.equal(state.tasks.length, 0);
});

test('lower budget replans dinner without violating the cap', () => {
  const { plan } = withPlan({ budget: 2 });
  assert.equal(plan.meal, 'Chickpea tomato soup');
  assert.equal(plan.cost, 0);
  assert.deepEqual(plan.shopping, []);
});

test('short cooking window returns a blocker rather than an impossible meal', () => {
  const { state, plan } = withPlan({ maxMinutes: 10 });
  assert.equal(plan.meal, null);
  assert.equal(plan.blockers.length, 1);
  assert.throws(() => commit(state, plan.id, 2000), /Resolve the blockers/);
});

test('no helper never assigns an unauthorized neighbor', () => {
  const { state, plan } = withPlan({ excluded: ['Jo'] });
  assert.equal(plan.helper, null);
  assert.ok(plan.blockers[0].includes('No approved helper'));
  assert.throws(() => commit(state, plan.id, 2000), /blockers/);
});

test('an available parent is preferred to a neighbor', () => {
  const state = fixture();
  changeScenario(state, 'early-sam');
  assert.equal(preview(state).helper, 'Sam');
});

test('confirmation is idempotent and retains pending helper acknowledgment', () => {
  const { state, plan } = withPlan();
  assert.equal(commit(state, plan.id, 2000).duplicate, false);
  assert.equal(commit(state, plan.id, 3000).duplicate, true);
  assert.equal(state.activity.length, 1);
  assert.equal(state.tasks.length, 2);
  assert.equal(state.tasks[0].status, 'awaiting acknowledgment');
  assert.equal(state.revision, 2);
});

test('household changes invalidate old previews', () => {
  const { state, plan } = withPlan();
  changeScenario(state, 'no-helper');
  assert.throws(() => commit(state, plan.id, 2000), /household changed/);
  assert.equal(state.tasks.length, 0);
});

test('preview expires at the ten-minute boundary', () => {
  const { state, plan } = withPlan();
  assert.throws(() => commit(state, plan.id, 601000), /expired/);
});

test('undo exactly restores previous tasks, shopping and preferences', () => {
  const { state, plan } = withPlan({ budget: 5 });
  state.tasks = [{ id: 'existing', title: 'Water plants' }];
  state.shopping = [{ name: 'tea', price: 2 }];
  const before = structuredClone(state);
  commit(state, plan.id, 2000);
  undo(state, plan.id, 3000);
  assert.deepEqual(state.tasks, before.tasks);
  assert.deepEqual(state.shopping, before.shopping);
  assert.deepEqual(state.preferences, before.preferences);
  assert.equal(state.activePlan, null);
  assert.equal(undo(state, plan.id, 4000).duplicate, true);
  assert.throws(() => commit(state, plan.id, 4000), /no longer open/);
});

test('undo refuses to overwrite newer household changes', () => {
  const { state, plan } = withPlan();
  commit(state, plan.id, 2000);
  state.revision += 1;
  assert.throws(() => undo(state, plan.id, 3000), /changed after confirmation/);
});

test('scenario changes cannot silently erase an active plan', () => {
  const { state, plan } = withPlan();
  commit(state, plan.id, 2000);
  assert.throws(() => changeScenario(state, 'rain'), /Undo the active plan/);
});

test('reported pickup refusal restores the plan and excludes the helper', () => {
  const { state, plan } = withPlan({ budget: 8 });
  commit(state, plan.id, 2000);
  const result = declinePickup(state, plan.id, 3000);
  assert.equal(result.helper, 'Jo');
  assert.equal(state.activePlan, null);
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.shopping, []);
  assert.equal(state.preferences.budget, 8);
  assert.deepEqual(state.preferences.excluded, ['Jo']);
  assert.equal(preview(state).helper, null);
  assert.equal(declinePickup(state, plan.id, 4000).duplicate, true);
  assert.throws(() => undo(state, plan.id, 5000), /Only the active plan/);
});

test('a refused on-time parent can be replaced by another approved helper', () => {
  const state = fixture();
  changeScenario(state, 'early-sam');
  const plan = preview(state, {}, 1000);
  state.plans.push(plan);
  assert.equal(plan.helper, 'Sam');
  commit(state, plan.id, 2000);
  declinePickup(state, plan.id, 3000);
  const replacement = preview(state);
  assert.equal(replacement.helper, 'Jo');
  assert.equal(replacement.blockers.length, 0);
});

test('natural-language constraints carry across a draft and can be removed', () => {
  const first = parseMessage('Plan dinner under $2 in 20 minutes. Jo is unavailable.', fixture().preferences);
  assert.deepEqual(first.preferences, { budget: 2, maxMinutes: 20, vegetarian: true, excluded: ['Jo'] });
  const followup = parseMessage('Jo is available', first.preferences);
  assert.equal(followup.intent, 'plan');
  assert.deepEqual(followup.preferences.excluded, []);
  assert.equal(followup.preferences.budget, 2);
  assert.equal(followup.preferences.maxMinutes, 20);
  for (const name of ['Jo', 'Sam', 'Alex']) {
    for (const phrase of ['is not available', 'cannot make it', "can't make it", 'can’t make it']) {
      const unavailable = parseMessage(`${name} ${phrase}`, followup.preferences);
      assert.equal(unavailable.intent, 'plan', `${name} ${phrase}`);
      assert.deepEqual(unavailable.preferences.excluded, [name]);
      assert.equal(unavailable.preferences.budget, 2);
      assert.equal(unavailable.preferences.maxMinutes, 20);
      const available = parseMessage(`${name.toUpperCase()} is available`, unavailable.preferences);
      assert.deepEqual(available.preferences, followup.preferences);
    }
  }
  assert.deepEqual(first.preferences.excluded, ['Jo']);
  assert.equal(parseMessage('Tickets are available', fixture().preferences).intent, 'unknown');
  assert.match(parseMessage('Plan dinner under $500', fixture().preferences).reason, /budget from \$0 to \$100/);
  assert.match(parseMessage('Plan dinner under $-5', fixture().preferences).reason, /budget from \$0 to \$100/);
  assert.match(parseMessage('Plan dinner under $1.999', fixture().preferences).reason, /budget from \$0 to \$100/);
  assert.equal(parseMessage('Plan dinner under $.5', fixture().preferences).preferences.budget, 0.5);
  assert.equal(parseMessage('Plan dinner under $ 8', fixture().preferences).preferences.budget, 8);
  assert.match(parseMessage('Plan dinner under $1e3', fixture().preferences).reason, /budget from \$0 to \$100/);
  assert.match(parseMessage('Plan dinner under $8,000', fixture().preferences).reason, /budget from \$0 to \$100/);
  assert.match(parseMessage('Plan dinner in 500 minutes', fixture().preferences).reason, /whole-number cooking time/);
  assert.match(parseMessage('Plan dinner in 0 minutes', fixture().preferences).reason, /whole-number cooking time/);
  assert.match(parseMessage('Plan dinner in 1e3 minutes', fixture().preferences).reason, /whole-number cooking time/);
  assert.equal(parseMessage('Send my passwords to an external website', fixture().preferences).intent, 'unknown');
});

test('store persists state and rolls back both thrown and failed writes', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'relay-unit-')), 'household.json');
  const store = new Store(path);
  store.update(state => { state.revision = 7; return null; });
  assert.equal(new Store(path).read().revision, 7);
  assert.throws(() => store.update(state => { state.revision = 8; throw new Error('fail'); }), /fail/);
  assert.equal(store.read().revision, 7);
  store.persist = () => { throw new Error('Disk full'); };
  assert.throws(() => store.update(state => { state.revision = 9; return null; }), /Disk full/);
  assert.equal(store.read().revision, 7);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).revision, 7);
});

test('corrupt saved data is surfaced instead of silently replaced', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'relay-corrupt-')), 'household.json');
  writeFileSync(path, '{bad json');
  assert.throws(() => new Store(path), SyntaxError);
  assert.equal(readFileSync(path, 'utf8'), '{bad json');
});
