# Submission text (Relay Home 2.1)

Track: **Alexa+** (self-hosted MCP server and Agent Skill, shown through a simulated Alexa+ experience).

## Tagline

A changed pickup time should not derail the whole evening. Relay rebuilds the plan, shows it, and asks before it acts.

## Inspiration

A family evening is a chain of small dependencies. School moves a pickup by 45 minutes and suddenly it matters who is
on the school's pickup list, whose train is late, what is in the pantry and how much of the week's grocery money is
left. A reminder tells you there is a problem. We wanted an assistant that works the problem, and that a parent could
trust with two things assistants usually should not do on their own: asking another adult to collect a child, and
spending money.

## What it does

You tell Relay what changed. It reads the household, checks in parallel who may collect the child and which dinners
fit, and drafts one plan. On a screen it shows that plan as cards: who can be asked and why the others cannot, the
dinner options with what is already at home, the evening at a glance.

Then it asks. "Ask Jo to collect Mia at Oakfield School, main gate by 5:15 PM?" Only a yes records the request, and
the pickup stays "awaiting reply" until Jo answers; Relay never calls it covered before that. Jo answers for
themselves: the display shows a code, Jo's phone opens a page that holds that one question, and a tap on "Yes, I
will be there" turns the card on the family's display to "Confirmed from their phone". Two people have to agree to
a pickup, and each of them says so on their own device. If dinner needs something,
Relay gets a price from the shop, asks you to confirm the exact total, and places the order once, inside the weekly
grocery cap you set. Say no and nothing happens. If the helper declines and nobody else on the school list can make
it, the plan stops and names no one; it will not suggest the neighbour who lives closer but is not on the list.

The household is remembered between sessions, and any MCP client that connects with the same token sees the same
evening.

The household, the school notice and the shop are simulated, no message is sent (the reply link is shown, not
delivered) and no money moves. The Alexa+
preview tools are not open to participants, so this runs in a browser page that stands in for Alexa+, as the FAQ allows.

## How we built it

- **MCP server** (TypeScript SDK 2.x, Streamable HTTP, stateless, bearer auth): twelve tools. It speaks protocol
  revision 2026-07-28 and still serves 2025-11-25 clients.
- **Confirmation inside the protocol.** The five tools that act for the household (ask a helper, take a request
  back, buy, cancel an order, change the weekly cap) answer `input_required` with a
  question; the retried call must carry the person's yes and the state the server sealed, so a yes cannot be replayed
  for another action. Older clients that cannot be asked get a sealed five-minute ticket and a `confirm_action` tool.
- **Purchasing with guard rails.** A quote is signed by the server (HMAC) and valid for ten minutes; an order must
  match it to the cent, fit the weekly cap, and carries an idempotency key so a retry never buys twice. Orders can be
  cancelled and the amount returns to the cap.
- **The helper's reply link.** `ask_helper` returns a link with a random code. The evening card draws it as a QR
  code with a small encoder of our own (no dependency, checked against a real scanner). The page behind it shows
  one question and takes one answer; it cannot read the household. The answer goes through the same server rule
  as when the family passes it on, the display announces it, and the agent is told before the next message.
- **A second host on the Strands Agents SDK** (AWS). `integrations/strands/relay_agent.py` drives the same server
  and skill from a terminal; Strands negotiates 2026-07-28 and answers Relay's `input_required` confirmations
  through an elicitation callback, so the person is asked in the protocol, not by the model. (AWS Builder mini
  challenge; no Bedrock, as we have no AWS account.)
- **MCP Apps views.** Four `ui://` cards (evening, helpers, dinners, receipt). Our page is a real MCP Apps host: it
  reads each view from the server, shows it in a sandboxed frame through `AppBridge`, and forwards only read-only
  tool calls from a card. A tap on a card sends a message into the conversation instead of acting, so every action
  still passes the agent and the confirmation.
- **Agent Skill.** `skills/relay-home-evening` (agentskills.io layout) tells an agent the order of work and the rules
  it must not bend. The simulator's agent loads it and reaches the household only through the MCP endpoint.
- **Agent.** A small loop that runs independent tool calls in parallel. In the demo video the agent is Gemini 3.5
  Flash-Lite following the skill. Without a key a built-in scripted model takes its place, so the project still runs
  out of the box and behaves the same every time; an adapter for any OpenAI-compatible service is included too.
- **Rules in the server.** Every rule above is enforced by the server and covered by tests, so an agent that
  ignores the skill still cannot get past them. 33 tests: the rules, the server in memory, the real HTTP endpoint on
  both protocol revisions, the helper's link, the agent, the model adapters.

## Challenges

We could not test on Alexa+, so we do not know how it answers `input_required`, renders views or loads a skill. We
built for both protocol revisions and kept every rule in the server for that reason. The most instructive bug was
ours: a declined confirmation was asked again eight times, because our handler only recognised a yes. The details
of this and thirteen other rough edges are in `docs/product-feedback.md`. The one we could not solve inside the
protocol: when the helper answers, a stateless server has no way to tell the host, so our page has to ask.

## Accomplishments we are proud of

A consent flow that lives in the protocol rather than beside it, and that covers both people a pickup needs; cards
that keep themselves current without being able to change anything; and a server whose rules hold no matter which
model is driving.

## What we learned

For actions on someone's behalf, the useful unit is not "a tool call" but "a question, a yes for exactly that
question, and one effect". MCP's multi-round-trip requests fit that well. And a household assistant earns trust less
by what it can do than by what it visibly will not do without asking.

## What's next

Run it on Alexa+ when the tools are available. Replace the simulated services with real ones behind the same tools:
a calendar, a messaging channel that delivers the helper's reply link, a grocery partner. Test it with
households, and measure whether a changed evening is actually repaired faster.

## Built with

Node.js, TypeScript SDK for MCP (server, client, node, express packages), MCP Apps (`@modelcontextprotocol/ext-apps`),
Agent Skills, Express, Zod, esbuild, HTML/CSS/JavaScript; Python, Strands Agents SDK, MCP Python SDK (the second host).

## Notes for the form

- Live demo: https://relay-home.onrender.com (free instance; Gemini 3.5 Flash-Lite on a free quota, scripted model as stand-in; MCP endpoint at `/mcp`).
- Video: https://youtu.be/W3LUTcaPIeE (public, 2:44; notes in `docs/demo-video.md`). Repository: https://github.com/yy5652-hash/relay-home (public, MIT).
- Product feedback and friction log: `docs/product-feedback.md`.
- AI coding assistance was used to write this project.
- AWS Builder: Strands Agents SDK, documented in `integrations/strands/README.md`; Bedrock not run (no AWS account).
- Open Source: a documentation and test fix to the MCP TypeScript SDK (the lead `input_required` example re-asked
  after a decline, the bug behind friction log entry 1); URL in the form.
- Not claimed: an Alexa+ integration, real services, user research. Only the Gemini adapter has been run live.
