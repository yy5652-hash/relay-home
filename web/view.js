// The code inside every Relay Home card. It runs in the host's sandboxed frame, receives the tool result through the
// MCP Apps bridge, draws it, and turns a tap into a message for the conversation (it never calls a tool on its own).
import { App } from '@modelcontextprotocol/ext-apps';
import { qrCode } from '../src/domain/qr.js';

const kind = document.body.dataset.view;
const root = document.getElementById('card');
const app = new App({ name: `relay-home-${kind}`, version: '2.1.0' }, {}, { autoResize: true });
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

// The helper's reply link as a code to scan. The card cannot open a link itself; it asks the host to.
function replyCode(url, who) {
  const rows = /^https?:/.test(url) ? qrCode(url) : null;
  const open = el('button', {}, `Open ${who}'s link here`);
  open.addEventListener('click', () => app.openLink({ url }).catch(() => {}));
  if (!rows) return el('section', { class: 'tile reply' }, el('div', {}, el('h3', {}, `${who} answers for themselves`), el('p', { class: 'quiet' }, 'Relay made a private link that answers only this request.'), open));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `-2 -2 ${rows.length + 4} ${rows.length + 4}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Code for ${who}'s reply link`);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', rows.map((row, y) => [...row].map((on, x) => (on === '1' ? `M${x} ${y}h1v1h-1z` : '')).join('')).join(''));
  svg.append(path);
  return el('section', { class: 'tile reply' }, el('div', { class: 'qr' }, svg), el('div', {}, el('h3', {}, `${who} answers for themselves`), el('p', {}, `Scan this with ${who}'s phone.`), el('p', { class: 'quiet' }, 'A private link that answers only this request. Relay does not send it in this demo.'), open));
}

const draw = {
  plan({ plan }) {
    const asked = { 'awaiting reply': chip('Asked · waiting for an answer', 'wait'), confirmed: chip(plan.pickup?.answeredVia === 'link' ? 'Confirmed from their phone' : 'Confirmed', 'ok'), declined: chip('Said no', 'no') }[plan.pickup?.status];
    const order = plan.dinner?.order;
    const state = [plan.pickup && { 'awaiting reply': `${plan.pickup.who} asked`, confirmed: `${plan.pickup.who} confirmed`, declined: `${plan.pickup.who} said no` }[plan.pickup.status], order && 'groceries ordered'].filter(Boolean);
    const pickup = plan.pickup
      ? el('section', { class: 'tile' }, el('h3', {}, 'Pickup'), el('p', { class: 'big' }, plan.pickup.who), el('p', {}, `${plan.pickup.role} · at the gate by ${plan.pickup.arrivesLabel}`), el('p', { class: 'quiet' }, `${plan.pickup.where}, needed by ${plan.pickup.by}`), asked ?? chip('Not asked yet', 'wait'))
      : el('section', { class: 'tile stop' }, el('h3', {}, 'Pickup'), el('p', { class: 'big' }, 'Nobody eligible'), el('p', {}, plan.blockers[0]));
    const dinner = plan.dinner
      ? el('section', { class: 'tile' }, el('h3', {}, 'Dinner'), el('p', { class: 'big' }, plan.dinner.name), el('p', {}, `${plan.dinner.cook} starts at ${plan.dinner.startLabel} · ${plan.dinner.minutes} min · ready ${plan.dinner.readyBy}`), order ? chip(`Ordered · ${plan.dinner.missing.join(', ')} · ${money(order.total)}`, 'ok') : plan.dinner.missing.length ? el('p', { class: 'quiet' }, `To buy: ${plan.dinner.missing.join(', ')} (${money(plan.dinner.cost)})`) : chip('All from the pantry', 'ok'))
      : el('section', { class: 'tile stop' }, el('h3', {}, 'Dinner'), el('p', { class: 'big' }, 'Nothing fits'), el('p', {}, plan.blockers.at(-1)));
    const actions = el('div', { class: 'actions' },
      plan.pickup && !asked && el('button', { class: 'primary', say: `Ask ${plan.pickup.who}` }, `Ask ${plan.pickup.who}`),
      plan.dinner?.missing.length && !order ? el('button', { say: 'Order the groceries' }, `Order for ${money(plan.dinner.cost)}`) : null);
    return [el('header', {}, el('h2', {}, 'This evening'), el('span', { class: 'quiet' }, state.length ? state.join(' · ') : 'Draft · nothing has been asked or bought')), el('div', { class: 'pair' }, pickup, dinner), plan.pickup?.replyUrl && replyCode(plan.pickup.replyUrl, plan.pickup.who), actions];
  },
  helpers({ options }) {
    return [el('header', {}, el('h2', {}, 'Who can collect Mia')), el('div', { class: 'row' }, options.map(person => el('section', { class: `tile slim ${person.eligible ? '' : 'dim'}` },
      el('p', { class: 'big' }, person.name), el('p', {}, `${person.role} · ${person.arrivesLabel}`),
      person.eligible ? chip('Can be asked', 'ok') : chip(person.approved ? 'Cannot make it' : 'Not on the school list', 'no'),
      el('p', { class: 'quiet' }, person.eligible ? person.note : person.reasons.join('. ')))))];
  },
  dinners({ options }) {
    return [el('header', {}, el('h2', {}, 'Dinner options')), el('div', { class: 'row' }, options.map(meal => el('section', { class: `tile slim ${meal.eligible ? '' : 'dim'}` },
      el('p', { class: 'big' }, meal.name), el('p', {}, `${meal.minutes} min · start ${meal.startLabel}`),
      el('div', { class: 'bar', title: `${meal.fromPantry} of ${meal.of} ingredients at home` }, el('i', { style: `width:${Math.round(100 * meal.fromPantry / meal.of)}%` })),
      el('p', { class: 'quiet' }, meal.missing.length ? `Buy ${meal.missing.join(', ')} · ${money(meal.cost)}` : 'Everything is in the pantry'),
      meal.eligible ? el('button', { say: `Make the ${meal.id === 'bowls' ? 'rice bowls' : meal.id}` }, 'Choose') : chip(meal.reasons[0], 'no'))))];
  },
  receipt({ order }) {
    return [el('header', {}, el('h2', {}, order.status === 'placed' ? 'Order placed' : 'Order cancelled'), el('span', { class: 'quiet' }, `${order.shop} · ${order.id}`)),
      el('section', { class: 'tile' }, el('ul', {}, order.lines.map(line => el('li', {}, el('span', {}, line.name), el('span', {}, money(line.price)))), order.fee ? el('li', {}, el('span', {}, 'Delivery'), el('span', {}, money(order.fee))) : null, el('li', { class: 'total' }, el('span', {}, 'Total'), el('span', {}, money(order.total)))), el('p', { class: 'quiet' }, order.slotLabel)),
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
app.onhostcontextchanged = context => { if (context.theme) document.documentElement.dataset.theme = context.theme; };
await app.connect();
const theme = app.getHostContext()?.theme;
if (theme) document.documentElement.dataset.theme = theme;
