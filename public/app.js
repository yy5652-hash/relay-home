const byId = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const clockLabel = minutes => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${minutes >= 720 ? 'PM' : 'AM'}`;
let state;
let csrf;
let currentPlan;
let busy = false;
let toastTimer;

function toast(message) {
  byId('toast').textContent = message;
  byId('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { byId('toast').hidden = true; }, 6500);
}

async function api(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relay-CSRF': csrf }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed. Please try again.');
  return data;
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll('button').forEach(button => { button.disabled = value; });
  byId('scenario').disabled = value || Boolean(state?.activePlan);
  byId('send').textContent = value ? '…' : '↑';
  byId('messages').setAttribute('aria-busy', String(value));
}

function renderState() {
  currentPlan = state.activePlan ? state.plans.find(plan => plan.id === state.activePlan) : [...state.plans].reverse().find(plan => plan.status === 'proposed');
  const preferences = currentPlan?.status === 'proposed' && currentPlan.baseRevision === state.revision && Date.now() < currentPlan.expiresAt ? currentPlan.preferences : state.preferences;
  const excluded = new Set(preferences.excluded.map(name => name.toLowerCase()));
  byId('scenario').value = state.scenario;
  byId('scenario').disabled = busy || Boolean(state.activePlan);
  byId('revision').textContent = `REVISION ${state.revision}`;
  const event = state.events.at(-1);
  byId('notice-title').textContent = event.title;
  byId('notice-detail').textContent = event.detail;
  document.querySelector('.source-pill').textContent = event.source.toUpperCase();
  byId('people').innerHTML = state.people.filter(person => person.authorized).map((person, index) => `<article class="person"><div class="person-top"><span class="avatar ${['peach', 'sage', 'lavender'][index]}">${escapeHtml(person.name[0])}</span><strong>${escapeHtml(person.name)}</strong></div><p>${escapeHtml(person.role)}<br>Calendar free ${clockLabel(person.available)}</p><small>✓ Approved pickup</small>${excluded.has(person.name.toLowerCase()) ? '<small class="person-unavailable">Unavailable for this pickup plan</small>' : ''}</article>`).join('');
  byId('pantry').innerHTML = state.pantry.map(item => `<span>${escapeHtml(item.name)}</span>`).join('');
  byId('activity').innerHTML = state.activity.length ? [...state.activity].reverse().slice(0, 5).map(item => `<div class="activity-item">${escapeHtml(item.text)}<small>${escapeHtml(new Date(item.at).toLocaleString())} · stored locally</small></div>`).join('') : '<p class="quiet">Your saved changes will appear here and survive a restart.</p>';
  if (state.messages.length) {
    byId('messages').innerHTML = state.messages.map(item => `<div class="message ${item.role}"><span class="message-label">${item.role === 'user' ? 'YOU' : 'RELAY'}</span><p>${escapeHtml(item.text).replace(/\n/g, '<br>')}</p></div>`).join('');
    byId('messages').scrollTop = byId('messages').scrollHeight;
    renderTrace([...state.messages].reverse().find(item => item.trace)?.trace ?? []);
  }
  renderPlan();
}

function renderTrace(trace) {
  byId('trace').innerHTML = trace.length ? trace.map(item => `<div class="trace-item"><code>${escapeHtml(item.name)}</code><small>${escapeHtml(JSON.stringify(item.args))}</small><small>✓ ${item.durationMs} ms · ${escapeHtml(item.detail ?? 'completed over Streamable HTTP')}</small></div>`).join('') : '<p class="quiet">No tool calls for this message.</p>';
}

function renderPlan() {
  const status = byId('plan-status');
  status.className = 'tag';
  if (!currentPlan) {
    status.textContent = 'Ready to plan';
    byId('plan-content').innerHTML = '<div class="empty-plan"><div class="empty-symbol">↗</div><h3>A clear plan starts here.</h3><p>Check who can make pickup, what’s in the pantry,<br>and how dinner fits around it all.</p><button id="start-plan" class="primary">Find a way through <span>↗</span></button><small>Nothing changes until you confirm.</small></div>';
    return;
  }
  const plan = currentPlan;
  const committed = plan.status === 'committed';
  const stale = !committed && plan.baseRevision !== state.revision;
  const expired = !committed && Date.now() >= plan.expiresAt;
  status.textContent = committed ? 'Saved locally' : stale ? 'Needs a recheck' : expired ? 'Preview expired' : plan.blockers.length ? 'Needs your help' : 'Your approval first';
  if (committed) status.classList.add('ready');
  if (plan.blockers.length || stale || expired) status.classList.add('blocked');
  const warning = stale ? '<div class="blocker">The household changed since this preview. Create a fresh plan before confirming.</div>' : expired ? '<div class="blocker">This ten-minute preview expired. Recheck the household before confirming.</div>' : '';
  const actions = committed
    ? `<div class="plan-buttons"><button class="secondary" id="pickup-declined">${escapeHtml(plan.helper)} can’t make it ↗</button><button class="secondary" id="undo-plan">Undo saved plan ↶</button></div>`
    : stale || expired || plan.blockers.length
      ? '<button class="primary" id="replan">Recheck the evening ↗</button>'
      : '<button class="primary" id="confirm-plan">Confirm local plan ↗</button>';
  byId('plan-content').innerHTML = warning + plan.blockers.map(blocker => `<div class="blocker">${escapeHtml(blocker)}</div>`).join('') + `<div class="timeline">${plan.steps.map(step => `<article class="timeline-step"><div class="step-time">${clockLabel(step.time)}</div><div class="step-main"><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.detail)}</p><span class="step-owner">${escapeHtml(step.owner)} · ${escapeHtml(step.status)}</span><details class="reason"><summary>Why this works</summary><p>${escapeHtml(step.reason)}</p></details></div></article>`).join('')}</div><div class="shopping"><div class="shopping-head"><span>Pantry-first shopping list</span><span>$${plan.cost.toFixed(2)} / $${plan.preferences.budget.toFixed(2)}</span></div><p>${plan.shopping.length ? plan.shopping.map(item => `${escapeHtml(item.name)} · $${item.price.toFixed(2)}`).join(' &nbsp; · &nbsp; ') : 'Everything for this meal is already in the demo pantry.'}</p><p>Estimated demo prices. No order will be placed.</p></div><div class="plan-actions"><p>${committed ? 'Saved locally. Record a refusal to reopen planning; pickup still needs a real acknowledgment.' : 'Saves local tasks and a shopping list. No messages are sent.'}</p>${actions}</div>`;
}

async function chat(message) {
  if (busy) return;
  setBusy(true);
  try {
    const result = await api('/api/chat', { message });
    state = result.state;
    renderState();
    byId('message').value = '';
  } catch (error) { toast(error.message); }
  finally { setBusy(false); }
}

byId('chat-form').addEventListener('submit', event => { event.preventDefault(); void chat(byId('message').value); });
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || busy) return;
  if (button.dataset.prompt) return void chat(button.dataset.prompt);
  if (button.id === 'start-plan' || button.id === 'replan') return void chat('Plan our evening');
  if (!['confirm-plan', 'undo-plan', 'pickup-declined'].includes(button.id) || !currentPlan) return;
  setBusy(true);
  let shouldReplan = false;
  try {
    const confirm = button.id === 'confirm-plan';
    const refused = button.id === 'pickup-declined';
    const result = await api(confirm ? '/api/confirm' : refused ? '/api/pickup-declined' : '/api/undo', { planId: currentPlan.id });
    state = result.state;
    renderState();
    toast(confirm ? 'Plan saved locally. Pickup still needs the helper’s acknowledgment.' : refused ? `${result.helper} was excluded from the next proposal. Checking other approved helpers…` : 'Plan undone. Previous tasks and shopping list restored.');
    shouldReplan = refused;
  } catch (error) { toast(error.message); }
  finally { setBusy(false); }
  if (shouldReplan) void chat('Replan pickup');
});
byId('scenario').addEventListener('change', async event => {
  if (busy) return;
  setBusy(true);
  try {
    const result = await api('/api/scenario', { scenario: event.target.value });
    state = result.state;
    renderState();
    toast('Demo scenario changed. Recheck the evening for a fresh plan.');
  } catch (error) { byId('scenario').value = state.scenario; toast(error.message); }
  finally { setBusy(false); }
});
try {
  const response = await fetch('/api/state');
  if (!response.ok) throw new Error('The local server is not ready. Reload to reconnect.');
  const data = await response.json();
  state = data.state;
  csrf = data.csrf;
  renderState();
} catch (error) {
  toast(error.message);
  setBusy(true);
  document.querySelector('.assistant-heading div>span').textContent = 'Connection unavailable';
}
