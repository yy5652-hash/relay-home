// The code inside every Relay Home card. It runs in the host's sandboxed frame, receives the tool result through the
// MCP Apps bridge, draws it, and turns a tap into a message for the conversation (it never calls a tool on its own).
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { qrCode } from '../src/domain/qr.js';
import { icon } from './icons.js';

const kind = document.body.dataset.view;
const root = document.getElementById('card');
const app = new App({ name: `relay-home-${kind}`, version: '2.3.3' }, {}, { autoResize: true });
const money = amount => `$${Number(amount).toFixed(2)}`;
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value; else if (key === 'say') node.addEventListener('click', () => say(value, node)); else if (value !== false && value != null) node.setAttribute(key, value);
  }
  node.append(...children.flat().filter(child => child != null && child !== false));
  return node;
};
async function say(text, button) {
  button.disabled = true;
  try { await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] }); } finally { setTimeout(() => { button.disabled = false; }, 1500); }
}
const chip = (text, tone) => el('span', { class: `chip ${tone}` }, text);
const label = (name, text) => el('h3', {}, icon(name, 14), text);
const clock = minutes => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, '0')}`;

// The helper's reply link as a code to scan. The card cannot open a link itself; it asks the host to.
function replyCode(url, who) {
  const rows = /^https?:/.test(url) ? qrCode(url) : null;
  const open = el('button', { class: 'link' }, `Open ${who}'s link here`);
  open.addEventListener('click', () => app.openLink({ url }).catch(() => {}));
  const words = el('div', {}, label('smartphone', `${who}'s private reply link`), el('p', {}, 'It answers this one request, and nothing else.'), el('p', { class: 'quiet' }, `A real deployment would message it to ${who}. This demo sends nothing, so the link is shown here: scan it with a phone, or open it.`), open);
  if (!rows) return el('section', { class: 'tile' }, words);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `-2 -2 ${rows.length + 4} ${rows.length + 4}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Code for ${who}'s reply link`);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', rows.map((row, y) => [...row].map((on, x) => (on === '1' ? `M${x} ${y}h1v1h-1z` : '')).join('')).join(''));
  svg.append(path);
  return el('section', { class: 'tile reply' }, el('div', { class: 'qr' }, svg), words);
}

// What an order did to the week's grocery money: the bar starts at what was left before and settles at what is left now.
function capMeter(cap, spent) {
  const share = amount => `${Math.max(0, Math.min(100, (amount / cap.weekly) * 100))}%`;
  const left = el('i', { class: 'left', style: `width: ${share(cap.before)}` }), went = el('i', { class: 'went', style: 'width: 0%' });
  const figure = el('b', {}, money(cap.before));
  requestAnimationFrame(() => setTimeout(() => {
    left.style.width = share(cap.left); went.style.width = share(spent);
    const start = performance.now(), run = now => { const k = Math.min(1, (now - start) / 900), eased = 1 - (1 - k) ** 3; figure.textContent = money(cap.before + (cap.left - cap.before) * eased); if (k < 1) requestAnimationFrame(run); };
    requestAnimationFrame(run);
  }, 1500));
  return el('section', { class: 'tile cap' }, label('shopping-bag', 'This week\'s grocery cap'), el('p', { class: 'figure' }, figure, el('span', { class: 'quiet' }, ` left of ${money(cap.weekly)}`)), el('div', { class: 'capbar' }, left, went),
    el('p', { class: 'quiet' }, `${money(cap.before)} before this order · ${money(spent)} spent, once`));
}

const draw = {
  plan({ plan }) {
    const asked = { 'awaiting reply': chip('Asked · waiting for an answer', 'wait'), confirmed: chip(plan.pickup?.answeredVia === 'link' ? 'Confirmed from their phone' : 'Confirmed', 'ok'), declined: chip('Said no', 'no') }[plan.pickup?.status];
    const order = plan.dinner?.order;
    const state = [plan.pickup && { 'awaiting reply': `${plan.pickup.who} asked`, confirmed: `${plan.pickup.who} confirmed`, declined: `${plan.pickup.who} said no` }[plan.pickup.status], order && 'groceries ordered'].filter(Boolean);
    const pickup = plan.pickup
      ? el('section', { class: 'tile' }, label('car', 'Pickup'), el('p', { class: 'big' }, plan.pickup.who), el('p', {}, `${plan.pickup.role} · at the gate by ${plan.pickup.arrivesLabel}`), el('p', { class: 'quiet' }, `${plan.pickup.where} · needed by ${plan.pickup.by}`), asked ?? chip('Not asked yet', 'wait'))
      : el('section', { class: 'tile stop' }, label('car', 'Pickup'), el('p', { class: 'big' }, 'Nobody eligible'), el('p', {}, plan.blockers[0]));
    const dinner = plan.dinner
      ? el('section', { class: 'tile' }, label('utensils', 'Dinner'), el('p', { class: 'big' }, plan.dinner.name), el('p', {}, `${plan.dinner.cook} starts at ${plan.dinner.startLabel} · ${plan.dinner.minutes} min`), el('p', { class: 'quiet' }, `Ready by ${plan.dinner.readyBy}`), order ? chip(`Ordered · ${plan.dinner.missing.join(', ')} · ${money(order.total)}`, 'ok') : plan.dinner.missing.length ? chip(`To buy · ${plan.dinner.missing.join(', ')} · ${money(plan.dinner.cost)}`, 'wait') : chip('All from the pantry', 'ok'))
      : el('section', { class: 'tile stop' }, label('utensils', 'Dinner'), el('p', { class: 'big' }, 'Nothing fits'), el('p', {}, plan.blockers.at(-1)));
    const buttons = [plan.pickup && !asked && el('button', { class: 'primary', say: `Ask ${plan.pickup.who}` }, `Ask ${plan.pickup.who}`), plan.dinner?.missing.length && !order ? el('button', { say: 'Order the groceries' }, `Order for ${money(plan.dinner.cost)}`) : null].filter(Boolean);
    return [el('header', {}, el('h2', {}, 'This evening'), el('span', { class: 'quiet' }, state.length ? state.join(' · ') : 'Draft · nothing has been asked or bought')), el('div', { class: 'pair' }, pickup, dinner), plan.pickup?.replyUrl && replyCode(plan.pickup.replyUrl, plan.pickup.who), buttons.length ? el('div', { class: 'actions' }, buttons) : null];
  },
  // Every adult's arrival at the gate against the deadline, on one time scale: who is on the list and in time is
  // then a matter of looking. Falls back to a plain list when the server does not send the times.
  helpers({ options, child = 'the child', by, deadline, now }) {
    const head = el('header', {}, el('h2', {}, `Who can collect ${child}`), by && el('span', { class: 'quiet' }, `needed by ${by}`));
    const verdict = person => (person.eligible ? 'on the list · in time' : !person.approved ? "not on the school's list" : deadline != null ? `${person.arrives - deadline} min late` : 'cannot make it');
    const tone = person => (person.eligible ? 'ok' : person.approved ? 'miss' : 'off');
    if (deadline == null || now == null) return [head, el('div', { class: 'lanes' }, options.map(person => el('div', { class: `lane ${tone(person)}` }, el('div', { class: 'row' }, el('span', { class: 'who' }, person.name, el('small', {}, person.role)), el('span', { class: 'verdict' }, el('span', { class: 't' }, person.arrivesLabel), verdict(person))))))];
    const people = [...options].sort((a, b) => a.arrives - b.arrives);
    const end = Math.max(deadline, ...people.map(person => person.arrives)) + 8;
    const at = minutes => `${(100 * (minutes - now) / (end - now)).toFixed(2)}%`;
    const ticks = [];
    for (let minute = Math.ceil((now + 12) / 30) * 30; minute < end - 6; minute += 30) ticks.push(minute);
    return [head, el('div', { class: 'lanes', style: `--d:${at(deadline)}` },
      el('div', { class: 'toolate' }), el('div', { class: 'deadline' }, el('b', {}, `needed by ${clock(deadline)}`)),
      people.map(person => el('div', { class: `lane ${tone(person)}`, style: `--x:${at(person.arrives)}` },
        el('div', { class: 'row' }, el('span', { class: 'who' }, person.name, el('small', {}, person.role)), el('span', { class: 'verdict' }, el('span', { class: 't' }, person.arrivesLabel), verdict(person))),
        el('div', { class: 'track' }, el('i', { class: 'run' }), el('i', { class: 'dot' })))),
      el('div', { class: 'axis' }, el('span', { style: 'left:0' }, `now ${clock(now)}`), ticks.map(minute => el('span', { style: `left:${at(minute)}` }, clock(minute)))))];
  },
  dinners({ options }) {
    return [el('header', {}, el('h2', {}, 'Dinner options'), el('span', { class: 'quiet' }, 'ranked by what is already at home')), el('div', { class: 'reel' }, options.map(meal => el('section', { class: `tile meal ${meal.eligible ? '' : 'dim'}` },
      el('p', { class: 'name' }, meal.name), el('p', { class: 'quiet' }, `${meal.minutes} min · start ${meal.startLabel}`),
      el('div', { class: 'segments', title: `${meal.fromPantry} of ${meal.of} ingredients at home` }, Array.from({ length: meal.of }, (_, index) => el('i', { class: index < meal.fromPantry ? 'on' : '' }))),
      el('p', { class: 'quiet' }, meal.missing.length ? `Buy ${meal.missing.join(', ')} · ${money(meal.cost)}` : 'Everything is at home'),
      meal.eligible ? el('button', { say: `Make the ${meal.id === 'bowls' ? 'rice bowls' : meal.id}` }, 'Choose') : chip(meal.reasons[0], 'no'))))];
  },
  receipt({ order, cap }) {
    const line = (name, amount, cls) => el('li', { class: cls }, el('span', {}, name), el('i'), el('span', {}, money(amount)));
    return [el('header', {}, el('h2', {}, order.status === 'placed' ? 'Order placed' : 'Order cancelled'), el('span', { class: 'quiet' }, `${order.shop} · ${order.id}`)),
      el('section', { class: 'tile receipt' }, label('receipt-text', 'Receipt'), el('ul', {}, order.lines.map(item => line(item.name, item.price)), order.fee ? line('Delivery', order.fee) : null, line('Total', order.total, 'total')), el('p', { class: 'quiet slot' }, icon('clock', 14), order.slotLabel)),
      cap && capMeter(cap, order.total),
      order.status === 'placed' && el('div', { class: 'actions' }, el('button', { say: 'Cancel the order' }, 'Cancel order'))];
  }
};

// The evening card keeps itself current: every few seconds it reads the household through the host (a `tools/call`
// the host forwards to the MCP server), so a reply from the helper or a placed order shows without a new card.
let shown = null;
if (kind === 'plan') setInterval(async () => {
  if (!shown || document.hidden) return;
  try {
    const fresh = (await app.callServerTool({ name: 'get_household', arguments: {} })).structuredContent?.plan;
    if (fresh && JSON.stringify(fresh) !== shown) { shown = JSON.stringify(fresh); root.replaceChildren(...draw.plan({ plan: fresh }).filter(Boolean)); }
  } catch { /* the host may not forward tool calls; the card then stays as drawn */ }
}, 3000);

const need = { plan: 'plan', helpers: 'options', dinners: 'options', receipt: 'order' };
app.ontoolresult = result => {
  const data = result.structuredContent;
  if (kind === 'plan' && data?.plan) shown = JSON.stringify(data.plan);
  root.replaceChildren(...(data?.[need[kind]] && draw[kind] ? draw[kind](data).filter(Boolean) : [el('p', { class: 'quiet' }, result.content?.[0]?.text ?? 'Nothing to show.')]));
};
// The host's theme and style variables (the MCP Apps `--color-*`, `--font-*`, `--border-radius-*` set) restyle the card.
const dress = context => {
  if (context?.theme) { applyDocumentTheme(context.theme); document.documentElement.dataset.theme = context.theme; }
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
};
app.onhostcontextchanged = dress;
await app.connect();
dress(app.getHostContext());
