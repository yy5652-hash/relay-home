# Submission text (Relay Home 2.3)

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

You tell Relay what changed, out loud. In Chrome, press the microphone on the kitchen display and speak: your words
appear as you say them, and Relay answers in its own voice, reads every confirmation out and listens for yes or no. It reads
the household, checks in parallel who may collect the child and which dinners fit, and drafts one plan. On a screen it shows that plan as cards: the evening at a glance, the dinner options with
what is already at home, and every adult's arrival drawn to scale against the school's deadline, so you can see why
Jo is asked, why Sam is five minutes late, and why Lee, who would be first, is never suggested.

Then it asks. "Ask Jo to collect Mia at Oakfield School, main gate by 5:15 PM?" Only a yes records the request, and
the pickup stays "awaiting reply" until Jo answers; Relay never calls it covered before that. Jo answers for
themselves: the display shows a code, Jo's phone opens a page that holds that one question, and a tap on "Yes, I
will be there" turns the card on the family's display to "Confirmed from their phone". Two people have to agree to
a pickup, and each of them says so on their own device. If dinner needs something,
Relay gets a price from the shop, asks you to confirm the exact total, and places the order once, inside the weekly
grocery cap you set; the receipt shows the week's grocery money moving from $18.60 to $15.40. Say no and nothing
happens. If the helper declines and nobody else on the school list can make
it, the plan stops and names no one; it will not suggest the neighbour who lives closer but is not on the list.

The household is remembered between sessions, and any MCP client that connects with the same token sees the same
evening.

Relay Home runs on a simulated Alexa+ kitchen display in the browser, as the hackathon FAQ provides while the Alexa+
preview tools are closed to participants. The family, the school and the shop are made up: the reply link is shown
rather than sent, and no money moves. The live demo at relay-home.onrender.com runs Gemini 3.5 Flash-Lite.

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
  through an elicitation callback, so the person is asked in the protocol, not by the model (AWS Builder mini
  challenge).
- **MCP Apps views.** Four `ui://` cards (evening, helpers, dinners, receipt). Our page is a real MCP Apps host: it
  reads each view from the server, shows it in a sandboxed frame through `AppBridge`, and forwards only read-only
  tool calls from a card. A tap on a card sends a message into the conversation instead of acting, so every action
  still passes the agent and the confirmation. The cards take their colours, type and radii from the MCP Apps host
  style variables, so they sit natively in whatever host shows them and fall back to their own light or dark palette.
- **Voice.** The display listens through the browser's speech recognition and answers through its speech synthesis:
  pressing the microphone switches the voice on, the words appear in the box as they are spoken, Relay's answers and every confirmation are read aloud, and a
  spoken yes or no answers the confirmation. The same consent rules apply whether you tap or speak.
- **Design.** The page is a kitchen display at dusk with the helper's phone beside it: at rest it shows tonight at a
  glance (pickup, dinner, the week's grocery money), and the phone sleeps on a lock screen and wakes with the one
  question when someone is asked. Under the display, every MCP call the agent made is
  listed with its arguments and timing. Reused rather than invented: Radix Colors, Lucide icons, Open Props easings
  and the Devices.css phone frame (all MIT or ISC, copied in as values; see `THIRD_PARTY_NOTICES.md`).
- **Agent Skill.** `skills/relay-home-evening` (agentskills.io layout) tells an agent the order of work and the rules
  it must not bend. The simulator's agent loads it and reaches the household only through the MCP endpoint.
- **Agent.** A small loop that runs independent tool calls in parallel, so a changed evening is planned in three model
  steps. The live demo and the demo video run Gemini 3.5 Flash-Lite following the skill. A model request that has not
  answered within 3 seconds is sent a second time and the first answer wins, which keeps the conversation quick when
  the model service has a slow moment. Without a key a built-in scripted model takes its place, so the project runs
  out of the box; an adapter for any OpenAI-compatible service is included too.
- **Rules in the server.** Every rule above is enforced by the server and covered by tests, so an agent that
  ignores the skill still cannot get past them. 37 tests: the rules, the server in memory, the real HTTP endpoint on
  both protocol revisions, the helper's link, the agent, the model adapters.

## Challenges

Building for a host before it is open. We made Relay depend on nothing a host might do differently: it speaks both
protocol revisions, and every rule lives in the server, so any host and any model get the same guarantees. The most
instructive bug was ours: a declined confirmation was asked again eight times, because the handler recognised only a
yes. We fixed it, opened a pull request to the MCP TypeScript SDK that fixes the documentation example the bug came
from, and logged it with fifteen other findings in our friction log, `docs/product-feedback.md`. And because a stateless server cannot call the host
back when the helper answers, the display checks every few seconds and announces Jo's answer the moment it lands.

## Accomplishments we are proud of

A consent flow that lives in the protocol rather than beside it, and that covers both people a pickup needs; cards
that keep themselves current without being able to change anything; and a server whose rules hold no matter which
model is driving.

## What we learned

For actions on someone's behalf, the useful unit is not "a tool call" but "a question, a yes for exactly that
question, and one effect". MCP's multi-round-trip requests fit that well. And a household assistant earns trust less
by what it can do than by what it visibly will not do without asking.

## What's next

Run it on Alexa+ as soon as the tools open. Put real services behind the same tools: a calendar, a messaging channel
that delivers the helper's reply link, a grocery partner. Then pilot it with families.

## Built with

Node.js, TypeScript SDK for MCP (server, client, node, express packages), MCP Apps (`@modelcontextprotocol/ext-apps`),
Agent Skills, Express, Zod, esbuild, HTML/CSS/JavaScript; Python, Strands Agents SDK, MCP Python SDK (the second host).

## Notes for the form

- Live demo: https://relay-home.onrender.com (Gemini 3.5 Flash-Lite; kept awake through the Judging Period; MCP endpoint at `/mcp`).
- Video: https://youtu.be/EhCnOVfZsgE (2:21; notes in `docs/demo-video.md`). Repository: https://github.com/yy5652-hash/relay-home (public, MIT).
- Product feedback and friction log: `docs/product-feedback.md`.
- AI coding assistance was used to write this project.
- AWS Builder: Strands Agents SDK, documented in `integrations/strands/README.md`.
- Open Source: a documentation and test fix to the MCP TypeScript SDK (the lead `input_required` example re-asked
  after a decline, the bug behind friction log entry 1); URL in the form.
- Not claimed: an Alexa+ integration, real services, user research. Only the Gemini adapter has been run live.
