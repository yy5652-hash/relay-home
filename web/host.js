// The simulator page: a stand-in for an Alexa+ device with a screen. It talks to the agent, shows Relay's cards as
// an MCP Apps host (sandboxed frames driven through AppBridge), and puts every confirmation in front of the person.
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) { if (key === 'class') node.className = value; else if (key.startsWith('on')) node.addEventListener(key.slice(2), value); else if (value !== false && value != null) node.setAttribute(key, value); }
  node.append(...children.flat().filter(child => child != null && child !== false));
  return node;
};
const money = amount => `$${Number(amount).toFixed(2)}`;
const theme = 'dark';      // the display is a device of its own and stays dark
// What the display tells every card about its surface, ink and type: the MCP Apps style variables. The cards stand
// on the display's own glass (a transparent ground), in the display's colours, instead of bringing their own.
const DISPLAY_STYLE = {
  '--color-background-primary': 'transparent', '--color-background-secondary': 'rgba(255, 255, 255, 0.05)', '--color-background-tertiary': 'rgba(255, 255, 255, 0.1)',
  '--color-background-info': '#7ce2fe', '--color-background-success': 'rgba(70, 167, 88, 0.17)', '--color-background-warning': 'rgba(255, 197, 61, 0.13)', '--color-background-danger': 'rgba(229, 77, 46, 0.17)',
  '--color-text-primary': '#edeef0', '--color-text-secondary': '#b0b4ba', '--color-text-tertiary': '#777b84', '--color-text-inverse': '#0d141f',
  '--color-text-info': '#75c7f0', '--color-text-success': '#71d083', '--color-text-warning': '#ffca16', '--color-text-danger': '#ff977d',
  '--color-border-primary': 'rgba(255, 255, 255, 0.1)', '--color-border-secondary': 'rgba(255, 255, 255, 0.06)', '--border-radius-lg': '18px',
  '--font-sans': 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  '--font-mono': 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'
};

let token;
let busy = false;
const api = (path, options = {}) => fetch(path, { ...options, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...options.headers } });

async function start() {
  let saved = null;
  try { saved = localStorage.getItem('relay-home-token'); } catch { /* storage may be unavailable */ }
  const session = await (await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: saved }) })).json();
  token = session.token;
  try { localStorage.setItem('relay-home-token', token); } catch { /* fine without it */ }
  $('endpoint').textContent = `${location.origin}/mcp`;
  await household();
  // The household outlives the page: a plan drawn earlier, on this device or by another MCP client, is back on screen.
  const home = (await (await api('/api/tool', { method: 'POST', body: JSON.stringify({ name: 'get_household', arguments: {} }) })).json()).structuredContent;
  glance(home);
  const kept = home?.plan;
  if (kept) await card({ view: 'ui://relay-home/plan.html', name: 'get_household', args: {}, summary: kept.summary, data: { plan: kept } });
  const refresh = () => { if (!busy && !document.hidden) household().catch(() => {}); };
  setInterval(refresh, 2500);
  document.addEventListener('visibilitychange', refresh);
}

// The display at rest shows tonight's three facts, from the same get_household answer an agent would read.
function glance(home) {
  if (!home || !$('g-pickup')) return;
  const { weeklyGroceryCap: cap, spentThisWeek: spent } = home.memory;
  $('g-pickup').textContent = home.pickup.by;
  $('g-pickup-note').textContent = `${home.child} · ${home.pickup.where}`;
  $('g-dinner').textContent = home.dinner.at;
  $('g-dinner-note').textContent = `${home.dinner.cook} cooks${home.memory.vegetarian ? ' · vegetarian' : ''}`;
  $('g-left').textContent = money(cap - spent);
  $('g-left-note').textContent = `left of ${money(cap)} this week`;
  const meter = $('g-meter');      // kept by reference: a card may replace this panel before the next frame
  requestAnimationFrame(() => { meter.style.width = `${Math.max(0, Math.min(100, (spent / cap) * 100))}%`; });
}

// ---------------------------------------------------------------- conversation
function bubble(who, text) {
  $('talk').querySelector('.hint')?.remove();
  const node = el('div', { class: `bubble ${who}` }, text);
  $('talk').append(node);
  node.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return node;
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  $('say').value = '';
  document.body.classList.add('busy');
  bubble('me', text);
  // The evening card stays live (it refreshes itself); look-ups and receipts from earlier turns stay visible but can no longer be tapped.
  for (const old of $('screen').querySelectorAll('figure:not([data-view$="plan.html"])')) { old.classList.add('earlier'); old.inert = true; }
  const turn = el('ol', { class: 'turn' });
  $('trace').prepend(el('li', { class: 'turn-wrap' }, el('p', { class: 'said' }, `“${text}”`), turn));
  const rows = new Map();
  try {
    const response = await api('/api/chat', { method: 'POST', body: JSON.stringify({ text }) });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let cut = buffer.indexOf('\n\n'); cut >= 0; cut = buffer.indexOf('\n\n')) {
        const event = JSON.parse(buffer.slice(6, cut));
        buffer = buffer.slice(cut + 2);
        await handle(event, turn, rows);
      }
    }
  } catch (error) {
    bubble('relay', `I lost the connection: ${error.message}`);
  }
  busy = false;
  document.body.classList.remove('busy');
  await household();
}

async function handle(event, turn, rows) {
  if (event.type === 'connected') {
    $('protocol').textContent = `MCP ${event.protocol}`;
    $('model').textContent = event.model;
    $('skill').textContent = event.skill;
  } else if (event.type === 'model') {
    $('model').textContent = event.model;
  } else if (event.type === 'call') {
    const row = el('li', { class: 'call pending' }, el('code', {}, event.name, event.together > 1 && el('em', { title: `Issued together with ${event.together - 1} other call${event.together > 2 ? 's' : ''}` }, '∥ parallel')), el('span', { class: 'args' }, Object.keys(event.args).length ? JSON.stringify(event.args).replace(/"quoteToken":"[^"]+"/, '"quoteToken":"…"') : ''), el('span', { class: 'ms' }, '…'));
    rows.set(event.id, row);
    turn.append(row);
  } else if (event.type === 'result') {
    const row = rows.get(event.id);
    row.classList.remove('pending');
    row.classList.add(event.error ? 'refused' : 'ok');
    row.querySelector('.ms').textContent = `${event.ms} ms`;
    row.append(el('p', { class: 'summary' }, event.summary));
    if (event.view && event.data) await card(event);
  } else if (event.type === 'ask') {
    const yes = await confirmSheet(event.question);
    turn.append(el('li', { class: `call ${yes ? 'ok' : 'refused'}` }, el('code', {}, 'confirmation'), el('span', { class: 'args' }, event.question), el('span', { class: 'ms' }, yes ? 'yes' : 'no')));
    await api('/api/answer', { method: 'POST', body: JSON.stringify({ id: event.id, yes }) });
  } else if (event.type === 'say') {
    bubble('relay', event.text);
    speak(event.text);
  }
}

function confirmSheet(question) {
  return new Promise(resolve => {
    $('question').textContent = question;
    $('sheet').hidden = false;
    $('yes').focus();
    let listener = null;
    const done = answer => { $('sheet').hidden = true; $('heard').hidden = true; $('yes').onclick = $('no').onclick = null; listener?.abort(); resolve(answer); };
    $('yes').onclick = () => done(true);
    $('no').onclick = () => done(false);
    // With voice on, the question is read out and a spoken yes or no answers it; anything else leaves the buttons.
    if (!voiceOn) return;
    speak(question, () => {
      if ($('sheet').hidden || !Recognition) return;
      listener = new Recognition();
      listener.lang = 'en-US';
      listener.onresult = event => { const said = event.results[0][0].transcript.trim().toLowerCase(); if (/^(yes|yeah|yep|sure|ok|okay|go ahead|do it|please do)\b/.test(said)) done(true); else if (/^(no|nope|don'?t|do not|cancel|stop|not now)\b/.test(said)) done(false); };
      listener.onend = () => { $('heard').hidden = true; };
      $('heard').hidden = false;
      try { listener.start(); } catch { $('heard').hidden = true; }
    });
  });
}

// ---------------------------------------------------------------- cards (MCP Apps host)
// Cards that run under the top or bottom of the screen area fade out there, only while there is more to scroll to.
const edges = () => { const zone = $('screen'); zone.classList.toggle('more-above', zone.scrollTop > 2); zone.classList.toggle('more-below', zone.scrollTop + zone.clientHeight < zone.scrollHeight - 2); };
$('screen').addEventListener('scroll', edges, { passive: true });
new MutationObserver(edges).observe($('screen'), { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'height'] });
addEventListener('resize', edges);
const views = new Map();
let evening = null;       // the bridge of the evening card on screen
// MCP Apps has no way to tell a view its data is stale, so the host sends the evening card a fresh result itself.
async function refreshEvening() {
  if (!evening) return;
  const result = await (await api('/api/tool', { method: 'POST', body: JSON.stringify({ name: 'get_household', arguments: {} }) })).json();
  if (result.structuredContent?.plan) evening.sendToolResult({ content: result.content, structuredContent: { plan: result.structuredContent.plan } }).catch(() => {});
}
async function card(event) {
  if (!views.has(event.view)) views.set(event.view, await (await api(`/api/view?uri=${encodeURIComponent(event.view)}`)).text());
  const frame = el('iframe', { class: 'card', sandbox: 'allow-scripts', title: event.name });
  $('screen').querySelector('.empty')?.remove();
  $('screen').querySelector(`figure[data-view="${event.view}"]`)?.remove();
  $('screen').prepend(el('figure', { 'data-view': event.view }, frame, el('figcaption', {}, el('span', {}, 'MCP Apps view · ', el('code', {}, event.view)), el('span', {}, event.name))));
  $('screen').scrollTo({ top: 0, behavior: 'smooth' });     // a new card comes into view, whatever was being looked at
  const bridge = new AppBridge(null, { name: 'Relay Home simulator', version: '2.3.4' }, { serverTools: {}, openLinks: {} }, { hostContext: { theme, displayMode: 'inline', platform: 'web', styles: { variables: DISPLAY_STYLE } } });
  bridge.oninitialized = () => {
    bridge.sendToolInput({ arguments: event.args ?? {} });
    bridge.sendToolResult({ content: [{ type: 'text', text: event.summary }], structuredContent: event.data });
    if (event.view.endsWith('/plan.html')) evening = bridge;
  };
  bridge.onsizechange = ({ height }) => { if (height) frame.style.height = `${Math.ceil(height)}px`; };
  // A card may read from the MCP server through the host; only read-only tools are forwarded.
  bridge.oncalltool = async ({ name, arguments: args }) => (await api('/api/tool', { method: 'POST', body: JSON.stringify({ name, arguments: args ?? {} }) })).json();
  // A card may ask for one kind of link to be opened: a helper's reply link on this server.
  bridge.onopenlink = async ({ url }) => { const target = new URL(url, location.origin); if (target.origin !== location.origin || !target.pathname.startsWith('/r/')) return { isError: true }; window.open(target, '_blank', 'noopener'); return {}; };
  // A tap inside a card arrives as a message for the conversation; the agent decides what to do with it.
  bridge.onmessage = async ({ content }) => { const text = content?.find(part => part.type === 'text')?.text; if (text) send(text); return {}; };
  await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
  frame.srcdoc = views.get(event.view);
}

// ---------------------------------------------------------------- household panel
let announced = null;
async function household() {
  const home = await (await api('/api/home')).json();
  // What happened outside the conversation (a helper answering from their phone) is announced on the display.
  const news = announced === null ? [] : home.announcements.slice(announced);
  for (const text of news) { bubble('relay news', text); speak(text); }
  if (news.length) refreshEvening();      // the card would find out by itself within a few seconds; this makes it now
  announced = home.announcements.length;
  // The helper's phone: the page behind the newest reply link, shown beside the display.
  const asked = home.requests.findLast(request => request.replyUrl && request.status !== 'withdrawn');
  $('phone').classList.toggle('awake', Boolean(asked));
  $('phone-who').textContent = asked ? asked.name : 'The helper';
  if (asked) {
    const path = new URL(asked.replyUrl, location.origin).pathname;
    if (!$('phone-frame').src.endsWith(path)) $('phone-frame').src = path;
  }
  const left = home.memory.weeklyGroceryCap - home.memory.spentThisWeek;
  $('notice').textContent = home.event.text;
  $('home').replaceChildren(
    el('h3', {}, 'Pickup requests'),
    home.requests.length ? el('ul', {}, home.requests.map(request => el('li', {}, el('span', {}, `${request.name} · ${request.status}`), request.status === 'awaiting reply' && el('span', { class: 'play' }, el('span', { class: 'quiet' }, 'Or tell Relay yourself:'), el('button', { onclick: () => send(`${request.name} confirmed`) }, `“${request.name} confirmed”`), el('button', { onclick: () => send(`${request.name} can't make it`) }, `“${request.name} can't make it”`))))) : el('p', { class: 'quiet' }, 'Nobody has been asked.'),
    el('h3', {}, 'Orders'),
    home.orders.length ? el('ul', {}, home.orders.map(order => el('li', {}, el('span', {}, `${order.id} · ${order.lines.map(line => line.name).join(', ')} · ${money(order.total)} · ${order.status}`)))) : el('p', { class: 'quiet' }, 'Nothing ordered.'),
    el('h3', {}, 'What Relay remembers'),
    el('p', {}, `${home.memory.vegetarian ? 'Vegetarian household' : 'No diet limit'} · ${money(left)} left of ${money(home.memory.weeklyGroceryCap)} this week`),
    el('p', { class: 'quiet' }, `Pantry: ${Object.entries(home.pantry).filter(([, count]) => count > 0).map(([name]) => name).join(', ')}`));
}

// ---------------------------------------------------------------- voice
let voiceOn = false;
function speak(text, then = () => {}) {
  if (!voiceOn || !('speechSynthesis' in window)) return then();
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = utterance.onerror = () => then();
  speechSynthesis.speak(utterance);
}
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Recognition) $('mic').hidden = true;
$('mic').onclick = () => {
  speechSynthesis?.cancel();
  // Whoever speaks to a kitchen display expects it to answer aloud, so the microphone switches Relay's voice on.
  if (!voiceOn) { $('voice').checked = true; voiceOn = true; }
  const listener = new Recognition();
  listener.lang = 'en-US';
  listener.interimResults = true;      // the words appear in the box while they are being said
  listener.onresult = event => { const heard = event.results[event.results.length - 1]; $('say').value = heard[0].transcript; if (heard.isFinal) send(heard[0].transcript); };
  listener.onend = () => $('mic').classList.remove('on');
  $('mic').classList.add('on');
  listener.start();
};
$('voice').onchange = event => { voiceOn = event.target.checked; if (!voiceOn) speechSynthesis?.cancel(); };

$('form').onsubmit = event => { event.preventDefault(); send($('say').value); };
for (const chip of document.querySelectorAll('[data-say]')) chip.onclick = () => send(chip.dataset.say);
$('reset').onclick = async () => { await api('/api/reset', { method: 'POST' }); location.reload(); };
start();
