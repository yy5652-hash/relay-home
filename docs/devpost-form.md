# Devpost form: the answers to paste (Relay Home 2.1)

Prepared 9 October 2026 for the "Additional info" page of submission 1216490. Everything below is written to be
pasted as is; the two URLs marked `‹›` are filled in once the open-source PR and the new video are public.

## Fields

- **Primary track:** Alexa+ (unchanged).
- **Code repository:** https://github.com/yy5652-hash/relay-home (public, MIT, licence visible in About).
- **New or existing:** New (started during the submission period). Not applicable: "what was updated".
- **Video demo link:** `‹new YouTube URL›` (1:52; the file and captions are on the repository's `media` branch).
- **Project testing link:** https://relay-home.onrender.com (free instance; the first load can take a minute).

## AWS Builder Mini Challenge: Yes

**Which AWS services did you incorporate and how?**

The Strands Agents SDK (`strands-agents` 1.59.0, AWS's open-source agent framework), as a second host for the
same MCP server: `integrations/strands/relay_agent.py`. A Strands `Agent` loads the project's Agent Skill as its
system prompt and gets Relay's tools through Strands' `MCPClient` over Streamable HTTP with the household's bearer
token. Strands negotiates MCP revision 2026-07-28 and drives the server's `input_required` confirmations itself:
when a tool asks for the person's yes, Strands calls our elicitation callback, which puts the question to the
person at the terminal and returns accept or decline, and the tool is retried with the answer. The server's
`confirm_action` tool (for clients that cannot be asked) is deliberately left out of the model's tool list, so on
this host the only road to an action is a human answer. Documented in `integrations/strands/README.md`, with a
recorded transcript (`--script --answer no`) in which the server refused the action and the model misreported it,
which is what the design is for: the rules hold in the server, not in the model. Not used: Amazon Bedrock and
AgentCore. We have no AWS account and the hackathon's credit codes were exhausted on 7 October; Strands' Bedrock
provider is wired in as the default when no Gemini key is set, but has not been run by us. Two friction-log entries
(15 and 16 in `docs/product-feedback.md`) came out of this integration.

## Open Source Mini Challenge: Yes

- **Contribution URL:** `‹PR URL on github.com/modelcontextprotocol/typescript-sdk›`
- **Project repository URL:** https://github.com/modelcontextprotocol/typescript-sdk
- **GitHub username:** yy5652-hash
- **Description:**

What: a documentation and test fix to the MCP TypeScript SDK (the SDK this project is built on). The first
`input_required` example a developer meets, in the `inputRequired` JSDoc and at the top of
`docs/servers/input-required.md`, tests only for an accepted answer, so when the person declines or cancels the
confirmation the handler returns `inputRequired()` again. The client then re-asks on every retry until
`inputRequired.maxRounds`: the person is put the same question eight times, and the server never sees an error.
We shipped exactly that bug by following the example (friction log entry 1). How: the example now reads the response
with `inputResponse()` first and finishes on any answer (accepted → act, declined or cancelled → an `isError` result),
the guide explains why `acceptedContent` alone cannot tell a decline from a first entry, and a new test in
`packages/server/test/server/inputRequired.test.ts` pins the one-round behaviour for both decline and cancel on the
2026-07-28 era. Why it matters: every action-taking MCP server for a voice assistant starts from this example; the
decline branch is the one that protects the person, and it was the one the example left out.

## Feature requests (optional)

1. Events between turns for Alexa+ add-ons (Critical). A self-hosted MCP server has no way to tell the assistant
   that something changed for a household between turns, for example a helper answering a pickup request from their
   phone. On stateless Streamable HTTP there is no channel, and a subscription needs a session. We need either a
   proactive notification the customer has allowed, or a callback URL the host gives the server, and a statement of
   what the assistant is told. Our simulator polls its own API instead; a real host could not. (Friction log 13.)
2. A public Alexa+ conformance client (Critical). A command-line client that connects to a self-hosted MCP server
   the way Alexa+ does and reports what it would do with each tool, view and confirmation would replace most of our
   guessing about `input_required`, MCP Apps views and Agent Skills on the device.
3. A first-class confirmation contract (Important): a tool annotation for "needs the person's yes", the decline
   branch in the SDK helpers and examples, and a documented fallback for clients that cannot be asked.
4. A light MCP Apps view runtime and a host-to-view refresh signal (Nice-to-have): the view-side `App` bundles to
   about 600 kB, and nothing tells a view its data is stale. (Friction log 6 and 8.)
5. Purchasing guidance for self-hosted servers (Nice-to-have): how to represent a quote, a cap and an idempotent
   order so Alexa+ presents them consistently.

## Friction log (optional)

Sixteen entries, each with the task, the steps, expected versus actual, severity, the workaround and a suggestion:
https://github.com/yy5652-hash/relay-home/blob/main/docs/product-feedback.md. The highest-severity ones: (1) a
declined confirmation was asked again eight times because the SDK example only handles the accept branch, fixed in
our server and sent upstream; (11) a model cancelled a purchase nobody asked it to cancel, because nothing in the tool
annotations marks "has an effect on money or on other people", fixed by putting every such tool behind a
confirmation; (13) a helper's answer arriving between turns cannot reach the host through MCP on a stateless
server; (15) Strands' client declares the elicitation capability only when given a callback, and the server's
refusal did not name the fix; (16) a small model reported the opposite of what the server said, while the household
stayed untouched.

## Feedback question 1: which developer tools, APIs and SDKs did you use, and for what?

- MCP TypeScript SDK 2.x, split packages (`@modelcontextprotocol/server` 2.3.1, `/client` 2.3.1, `/node` 2.1.1,
  `/express` 2.0.2): the MCP server with twelve tools, the Streamable HTTP endpoint with bearer auth, the agent's
  client, in-memory tests; protocol revision 2026-07-28 with 2025-11-25 served to older clients.
- MCP Apps (`@modelcontextprotocol/ext-apps` 2.0.3): four `ui://` views (evening, helpers, dinners, receipt) and the
  `AppBridge` host inside our simulator page.
- Agent Skills (agentskills.io layout): `skills/relay-home-evening`, loaded as the agent's instructions by both hosts.
- Strands Agents SDK 1.59.0 with its Gemini provider, and the MCP Python SDK 2.1.1 it uses: the second host.
- Gemini 3.5 Flash-Lite (REST): the hosted model in the demo video and on the hosted copy; a scripted model when no key
  is set. Express 5, Zod 4, esbuild, Node 24's test runner. Render (free tier) hosts the demo.
- Not available to us: the Alexa+ preview tools (Category SDK, MCP Toolkit, CLI, Web Simulator); the hackathon FAQ
  confirms they are closed to participants, so the simulator page stands in for the device.

## Feedback question 2: what worked well?

- MCP TypeScript SDK: `createMcpHandler` with `toNodeHandler` serves both protocol revisions from one stateless
  endpoint and tells the factory which kind of client is calling, so one set of tools only branches on how to ask.
  `input_required` is the right shape for consent: a question and sealed state, answered by retrying the same call,
  nothing to clean up, one confirmation per action. `InMemoryTransport.createLinkedPair()` let the whole server be
  tested without a port, confirmations included.
- MCP Apps: the same tool result feeds the model (text), a program (`structuredContent`) and a person (the view).
  Hosting a card with `AppBridge` is about fifteen lines; `openLink` gave the card a safe way to hand a link to the
  host.
- Strands: `MCPClient(url, headers, elicitation_callback)` and `Agent(model, tools, system_prompt)` were all it took
  to get a second host; its message history (`agent.messages`) made a faithful transcript printer easy. Strands drove
  the 2026-07-28 multi-round-trip without any code from us once the callback was declared.
- MCP Python SDK: negotiated the modern revision with our TypeScript server first time; the capability error it
  relayed was precise.
- Gemini REST: function calling with a system instruction and parallel calls worked as documented; the free tier was
  enough for development and filming.

## Feedback question 3: what needs work?

- MCP TypeScript SDK: the lead `input_required` example re-asks after a decline (we sent a PR); `requestState` is a
  method while `inputResponses` is a property; a 2.x client talks the old revision over HTTP unless given
  `versionNegotiation: { mode: 'auto' }`, and nothing logs the negotiated revision; no documented confirmation
  pattern for stateless servers facing 2025-11-25 clients (we built a ticket tool); a thrown plain `Error` from a
  bearer verifier becomes a 500 and `expiresAt` is required but undocumented; nothing in tool annotations says "this
  needs the person's yes" or "this affects other people or money" (`destructiveHint` is not that).
- MCP Apps: the view runtime bundles to about 600 kB and has to be inlined into every view; a view's tool calls need a
  server-side proxy with an allow-list and the spec gives no safe default; nothing tells a view its data is stale;
  that views cannot navigate and must use `openLink` is only in the type definitions.
- Agent Skills: no way to check what a host will do with a skill, so every rule had to go into the server as well.
- Alexa+: no way for a server to raise an event for a household between turns; no public conformance client; the
  preview tools are closed, so nothing here was run on a device.
- Strands: the elicitation capability is declared only when a callback is passed and the error does not say so; no
  hook to attach a tool's structured outcome to the model's final answer, so a small model can report the opposite
  of what the server did.
- Gemini: a long opaque token was altered in transit by the model (we shortened it); `gemini-3.5-flash` returned 503
  often enough that we kept Flash-Lite, which misreads a decline now and then.

## Feedback question 4: how was onboarding?

- MCP TypeScript SDK: from zero to a tool answering over Streamable HTTP in an afternoon; the hard part was the
  2.x split-package line (ext-apps needs it and Zod 4), which the hackathon material does not point at. A
  version-pinned starter (2.x server, bearer auth, one tool with a view, one with a confirmation, one test per
  revision) would have saved a day.
- MCP Apps: hello world in an hour once on the 2.x line; the host side took longer because tool calls from a view
  need a proxy.
- Agent Skills: the layout is simple; the unknown is what a host reads.
- Strands: `pip install "strands-agents[gemini]"` and about eighty lines to a working host, including the
  transcript; the only wall was the capability error (entry 15), half an hour.
- Alexa+ itself: zero to hello world is not possible for a participant; the FAQ says so plainly, which we appreciated.

## Feedback question 5: would you build with these devices and services again?

Yes. The multi-round-trip confirmation and MCP Apps together cover what a household agent needs: act only after a
yes, and show the person what they are agreeing to. Strands showed that an off-the-shelf agent can drive those
confirmations through the protocol with no code of ours. The rough edges above are about defaults, documentation
and one missing channel (events between turns), not about the design. We would want the Alexa+ preview tools, or a
conformance client, before shipping.

## Which AI tools have you leveraged while working on this project?

Gemini 3.5 Flash-Lite as the hosted model inside the product (through its REST API; a scripted model stands in
without a key). AI coding assistance (Claude, via Claude Code; earlier, ChatGPT and Codex) was used while writing
the code, the tests and the documentation; the narration of the demo video is a synthetic voice (Kokoro). All
material was read and checked by the author.

- **Level of learning:** Significant.
- **AI value for your career:** Yes.
