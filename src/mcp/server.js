// The Relay Home MCP server: one instance per household, created for each request (stateless Streamable HTTP).
// Read tools answer straight away. Tools that ask a person for something or spend money return `input_required`
// first; they only act when the retried call carries the person's confirmation and the sealed state Relay issued.
import { acceptedContent, inputRequired, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { clock, GROCER, money } from '../domain/household.js';
import { dinnerOptions, pickupOptions, planNow } from '../domain/planner.js';
import { cancelOrder, placeOrder, quoteGroceries, readQuote, recordReply, Refusal, remember, requestPickup, savePlan, seal, unseal, withdrawRequest } from '../domain/actions.js';
import { VIEWS, viewMeta } from './views.js';

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const DRAFT = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ACT = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const Confirm = z.object({ confirm: z.boolean().describe('Yes to go ahead') });

const reply = (text, data) => ({ content: [{ type: 'text', text }], structuredContent: data });
const refuse = text => ({ content: [{ type: 'text', text }], isError: true });

// `canAsk` is false when the connection cannot carry a question back to the person (a stateless 2025-11-25 request).
export function createRelayServer({ homes, id, secret, canAsk = true }) {
  const server = new McpServer({ name: 'relay-home', title: 'Relay Home', version: '2.0.0' }, {
    instructions: 'Relay Home rebuilds a family evening after a change of plan. Read first, draft a plan, then ask before anything is requested from a person or bought. A pickup is never "covered" until the helper has confirmed.'
  });
  const read = () => homes.read(id);
  const change = work => homes.update(id, work);
  // Domain refusals are answers for the person, not failures of the server.
  const guarded = handler => async (args, ctx) => {
    try { return await handler(args ?? {}, ctx); } catch (error) { if (error instanceof Refusal) return refuse(error.message); throw error; }
  };
  // Asks the person, or returns undefined when the retried call already carries a yes for exactly this state.
  // Clients on the 2026-07-28 revision answer inside the same tool call (multi-round-trip). A 2025-11-25 client on a
  // stateless connection cannot be asked by the server, so it gets a sealed, short-lived ticket for `confirm_action`.
  const needsYes = (ctx, state, message) => {
    if (canAsk) {
      const answer = acceptedContent(ctx.mcpReq.inputResponses, 'confirm', Confirm);
      const echoed = unseal(ctx.mcpReq.requestState(), secret);
      const sameQuestion = echoed && JSON.stringify(echoed) === JSON.stringify(state);
      if (sameQuestion && answer?.confirm === true) return undefined;
      // An answer that is not a yes (no, declined, dismissed) ends the call; Relay does not ask twice.
      if (sameQuestion && ctx.mcpReq.inputResponses?.confirm) return reply('The person did not say yes, so nothing was done.', { done: false, reason: 'not confirmed', plan: planNow(read()) });
      return inputRequired({ inputRequests: { confirm: inputRequired.elicit({ message, requestedSchema: Confirm }) }, requestState: seal(state, secret) });
    }
    const ticket = seal({ ...state, expires: Date.now() + 5 * 60_000 }, secret);
    return reply(`Not done yet. Ask the person: "${message}" Only if they say yes, call confirm_action with the ticket.`, { needsConfirmation: { question: message, ticket, expiresInSeconds: 300 } });
  };
  // The two things Relay does on someone's behalf, shared by both confirmation paths.
  const perform = state => {
    if (state.do === 'ask') {
      const request = change(draft => requestPickup(draft, state.name));
      return reply(`${request.name} has been asked. The pickup is not covered until ${request.name} confirms.`, { request, plan: planNow(read()) });
    }
    const quote = readQuote(state.quoteToken, secret);
    const order = change(home => placeOrder(home, quote, { confirmedTotal: quote.total, key: state.key }));
    return reply(order.repeated ? `Order ${order.id} was already placed with this key; nothing new was bought.` : `Order ${order.id} placed for ${money(order.total)}. ${order.slotLabel}.`, { order });
  };

  server.registerTool('get_household', {
    title: 'Read the household', annotations: READ,
    description: 'Today\'s change of plan, who is on the school pickup list, the dinner slot, the pantry, what the household asked Relay to remember, open pickup requests, recent orders and the activity log. All of it is a synthetic demo household.'
  }, guarded(() => {
    const home = read();
    return reply(`${home.event.text} Dinner is at ${clock(home.dinner.time)}; ${money(home.memory.weeklyGroceryCap - home.memory.spentThisWeek)} is left of this week's grocery cap.`, {
      revision: home.revision, date: home.date, event: home.event, child: home.child,
      pickup: { by: clock(home.pickup.deadline), where: home.pickup.location, usuallyDoneBy: home.pickup.original },
      dinner: { at: clock(home.dinner.time), cook: home.dinner.cook }, pantry: home.pantry, memory: home.memory,
      requests: home.requests, orders: home.orders, plan: planNow(home), log: home.log.slice(-8)
    });
  }));

  server.registerTool('find_pickup_helpers', {
    title: 'Who can collect the child', annotations: READ, _meta: viewMeta('helpers'),
    description: 'Checks every known adult against the school pickup list, their calendar and travel time. Returns who is eligible and, for everyone else, the reason. Only eligible people may be asked.',
    inputSchema: z.object({ exclude: z.array(z.string()).max(4).optional().describe('Names to leave out, for example someone who already said no') })
  }, guarded(({ exclude }) => {
    const options = pickupOptions(read(), { exclude });
    const ok = options.filter(option => option.eligible);
    return reply(ok.length ? `${ok.map(option => `${option.name} (${option.role.toLowerCase()}, there by ${option.arrivesLabel})`).join(', ')} can make it.` : 'Nobody on the school pickup list can make it in time.', { options });
  }));

  server.registerTool('suggest_dinners', {
    title: 'What dinner fits', annotations: READ, _meta: viewMeta('dinners'),
    description: 'Ranks the household\'s meals by how much comes from the pantry, within the time limit, the diet and what is left of the weekly grocery cap. Returns the items to buy and their price at the simulated grocer.',
    inputSchema: z.object({ budget: z.number().min(0).max(200).optional().describe('Most to spend on groceries for this dinner, in dollars'), maxMinutes: z.number().int().min(5).max(180).optional().describe('Longest cooking time in minutes') })
  }, guarded(({ budget, maxMinutes }) => {
    const options = dinnerOptions(read(), { budget, maxMinutes });
    const best = options.find(option => option.eligible);
    return reply(best ? `${best.name}: ${best.minutes} min, start at ${best.startLabel}, ${best.missing.length ? `buy ${best.missing.join(', ')} (${money(best.cost)})` : 'nothing to buy'}.` : 'No meal fits these limits.', { options });
  }));

  server.registerTool('draft_evening_plan', {
    title: 'Draft the evening', annotations: DRAFT, _meta: viewMeta('plan'),
    description: 'Puts pickup and dinner together into one plan and stores it as the current draft. Nothing is requested or bought. If nobody eligible can collect the child the plan says so and names no one.',
    inputSchema: z.object({ budget: z.number().min(0).max(200).optional(), maxMinutes: z.number().int().min(5).max(180).optional(), exclude: z.array(z.string()).max(4).optional(), meal: z.string().max(60).optional().describe('A meal the person asked for by name; used if it fits the limits') })
  }, guarded(constraints => {
    const plan = change(home => savePlan(home, constraints));
    return reply(plan.summary, { plan: planNow(read()) });
  }));

  server.registerTool('ask_helper', {
    title: 'Ask someone to do the pickup', annotations: ACT, _meta: viewMeta('plan'),
    description: 'Records that the household asks this person to collect the child. Needs a yes from the person using Relay. The pickup stays "awaiting reply" until record_helper_reply is called; Relay does not contact anyone itself in this demo.',
    inputSchema: z.object({ name: z.string().describe('An eligible person from find_pickup_helpers') })
  }, guarded(({ name }, ctx) => {
    const home = read();
    const person = pickupOptions(home).find(option => option.name.toLowerCase() === name.toLowerCase());
    if (!person?.eligible) throw new Refusal(person ? `${person.name} cannot be asked: ${person.reasons.map(reason => reason[0].toLowerCase() + reason.slice(1)).join('; ')}.` : `Relay does not know anyone called ${name}.`);
    const state = { do: 'ask', name: person.name, revision: home.revision };
    return needsYes(ctx, state, `Ask ${person.name} to collect ${home.child} at ${home.pickup.location} by ${clock(home.pickup.deadline)}?`) ?? perform(state);
  }));

  server.registerTool('record_helper_reply', {
    title: 'Record the helper\'s answer', annotations: DRAFT, _meta: viewMeta('plan'),
    description: 'Stores what the helper answered. After a "no" that person is left out of new plans for today, so draft the evening again.',
    inputSchema: z.object({ requestId: z.string(), accepted: z.boolean() })
  }, guarded(({ requestId, accepted }) => {
    const request = change(home => recordReply(home, requestId, accepted));
    return reply(accepted ? `${request.name} confirmed. Pickup is covered.` : `${request.name} cannot do it. Draft the evening again to find someone else.`, { request, plan: planNow(read()) });
  }));

  server.registerTool('withdraw_pickup_request', {
    title: 'Withdraw a pickup request', annotations: DRAFT, _meta: viewMeta('plan'),
    description: 'Takes back a request that has not been answered yet.',
    inputSchema: z.object({ requestId: z.string() })
  }, guarded(({ requestId }) => { const request = change(home => withdrawRequest(home, requestId)); return reply(`The request to ${request.name} was withdrawn.`, { request, plan: planNow(read()) }); }));

  server.registerTool('quote_groceries', {
    title: 'Price the missing groceries', annotations: READ,
    description: `Asks ${GROCER.name} for a price and a collection or delivery slot. Returns a quote that is valid for ten minutes and a quoteToken to pass to place_grocery_order. Nothing is bought.`,
    inputSchema: z.object({ items: z.array(z.string()).min(1).max(12), slot: z.enum(GROCER.slots.map(slot => slot.id)).optional() })
  }, guarded(({ items, slot }) => {
    const quote = quoteGroceries(read(), { items, slot }, secret);
    const { token, ...shown } = quote;
    return reply(`${quote.lines.map(line => line.name).join(', ')} for ${money(quote.total)} (${quote.slotLabel}). ${quote.withinCap ? `${money(quote.leftThisWeek)} is left this week.` : `That is over the ${money(quote.leftThisWeek)} left this week.`}`, { quote: shown, quoteToken: token, slots: GROCER.slots });
  }));

  server.registerTool('place_grocery_order', {
    title: 'Buy the quoted groceries', annotations: ACT, _meta: viewMeta('receipt'),
    description: 'Places the order for exactly the quoted items and total. Needs a yes from the person using Relay, refuses anything over the weekly grocery cap, and returns the same order if called again with the same orderKey. The shop is simulated; no money moves.',
    inputSchema: z.object({ quoteToken: z.string(), orderKey: z.string().min(6).max(64).describe('Any unique string for this purchase; reuse it when retrying') })
  }, guarded(({ quoteToken, orderKey }, ctx) => {
    const quote = readQuote(quoteToken, secret);
    const earlier = read().orders.find(order => order.key === orderKey);
    if (earlier) return reply(`Order ${earlier.id} was already placed with this key; nothing new was bought.`, { order: { ...earlier, repeated: true } });
    const state = { do: 'order', quoteToken, key: orderKey };
    return needsYes(ctx, state, `Buy ${quote.lines.map(line => line.name).join(', ')} from ${quote.shop} for ${money(quote.total)}? ${quote.slotLabel}.`) ?? perform(state);
  }));

  server.registerTool('confirm_action', {
    title: 'Carry out a confirmed action', annotations: ACT,
    description: 'For clients that cannot show Relay\'s own confirmation prompt: after the person has said yes to the question returned by ask_helper or place_grocery_order, pass the ticket from that answer here. A ticket works once, for exactly that action, for five minutes.',
    inputSchema: z.object({ ticket: z.string() })
  }, guarded(({ ticket }) => {
    const state = unseal(ticket, secret);
    if (!state?.do) throw new Refusal('This ticket was not issued by Relay or has been altered.');
    if (Date.now() > state.expires) throw new Refusal('This ticket has expired. Ask again.');
    if (state.do === 'ask' && state.revision !== read().revision) throw new Refusal('The household changed since the question was asked. Ask again.');
    return perform(state);
  }));

  server.registerTool('cancel_grocery_order', {
    title: 'Cancel an order', annotations: DRAFT, _meta: viewMeta('receipt'),
    description: 'Cancels a placed order and returns its amount to the weekly cap.',
    inputSchema: z.object({ orderId: z.string() })
  }, guarded(({ orderId }) => { const order = change(home => cancelOrder(home, orderId)); return reply(`Order ${order.id} is cancelled.`, { order }); }));

  server.registerTool('update_preferences', {
    title: 'Change what Relay remembers', annotations: DRAFT,
    description: 'Changes the diet preference or the weekly grocery cap that Relay keeps between sessions.',
    inputSchema: z.object({ vegetarian: z.boolean().optional(), weeklyGroceryCap: z.number().min(0).max(500).optional() })
  }, guarded(preferences => { const memory = change(home => remember(home, preferences)); return reply(`Remembered: ${memory.vegetarian ? 'vegetarian' : 'no diet limit'}, ${money(memory.weeklyGroceryCap)} a week for groceries.`, { memory }); }));

  for (const view of Object.values(VIEWS)) {
    server.registerResource(view.name, view.uri, { title: view.title, description: view.description, mimeType: view.mimeType }, async uri => ({ contents: [{ uri: uri.href, mimeType: view.mimeType, text: view.html() }] }));
  }
  return server;
}
