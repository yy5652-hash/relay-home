# Product feedback and friction log

Written during the build of Relay Home 2.0 (October 2026). Everything below was hit while writing the code in this
repository; where an item is about documentation rather than behaviour, it says so. We had no access to the Alexa+
preview tools (Category SDK, MCP Toolkit, Alexa CLI, Web Simulator), so nothing here is hands-on feedback on those;
the section "What we could not test" lists what that leaves open.

## Tools used

| Tool | Version | Used for |
|---|---|---|
| MCP TypeScript SDK, split packages (`@modelcontextprotocol/server`, `/client`, `/node`, `/express`) | 2.3.1 / 2.3.1 / 2.1.1 / 2.0.2 | The server, the HTTP endpoint with bearer auth, the agent's client, in-memory tests |
| MCP specification | 2026-07-28, with 2025-11-25 for older clients | Streamable HTTP, multi-round-trip `input_required`, tool annotations |
| MCP Apps (`@modelcontextprotocol/ext-apps`) | 2.0.3 (spec 2026-01-26) | `ui://` views, the `App` class inside cards, `AppBridge` in our host page |
| Agent Skills format (agentskills.io) | as published | `skills/relay-home-evening/` |
| Express, Zod, esbuild, Node.js test runner | 5.2.1, 4.6.5, 0.28.2, Node 24 | Routing, schemas, browser bundles, tests |
| Hackathon rules and FAQ | read 2026-10-07 | Track requirements, what a simulated experience may be |

## What worked well

- **One handler for two protocol revisions.** `createMcpHandler(factory)` with `toNodeHandler` serves 2026-07-28 and
  2025-11-25 clients from the same stateless endpoint, and the factory is told which kind of client is calling. That
  made it possible to keep one set of tools and only branch on how to ask the person.
- **`input_required` is the right shape for consent.** A tool that needs a yes returns a question and a sealed
  state; the client answers by retrying the same call. There is no session to keep and nothing to clean up, and the
  confirmation is tied to one action. It replaced the separate confirm endpoint
  outside MCP that our first version needed.
- **MCP Apps separates data from presentation cleanly.** The same tool result feeds the model (text), a program
  (`structuredContent`) and a person (the view). With `AppBridge`, the part of our page that hosts a card is about fifteen lines.
- **`InMemoryTransport.createLinkedPair()`** let the whole server be tested without a port, including confirmations.

## Friction log

Each entry: what we were doing, what we expected, what happened, what we did, what would help. We did not time the
individual problems, so no durations are given.

### 1. A declined confirmation is asked again, eight times
- **Doing:** `place_grocery_order` returns `inputRequired(...)` until the retried call carries an accepted answer.
- **Expected:** when the person declines, the call ends.
- **Happened:** our handler only recognised an accepted answer, so on a decline it returned `input_required` again.
  The client asked the person again, and again, until it gave up with `Multi-round-trip request 'tools/call' still
  required input after 8 rounds`. A user would have seen the same question eight times.
- **How it was found:** late, when a test that had been written too loosely was tightened.
- **Fix:** treat "an answer is present for this exact state, and it is not a yes" as final and return a normal result
  (`done: false`).
- **Would help:** the `inputRequired` documentation should show the decline branch next to the accept branch, and
  `acceptedContent` could have a sibling that returns `accepted | declined | absent` so the three cases are explicit.
  Severity: high, because the failure is silent on the server and user-facing.

### 2. `ctx.mcpReq.requestState` is a function
- **Doing:** reading back the sealed state on the retried call.
- **Expected:** a property, like `ctx.mcpReq.inputResponses` next to it.
- **Happened:** it is a method. Comparing the function to our state never matched, so every retry asked again
  (the same eight-round loop as above, for a different reason). No error or warning.
- **Would help:** make the two accessors the same kind of thing, or have TypeScript-less users get a runtime warning
  when a function is serialised into a comparison. Severity: medium.

### 3. A new client talks the old revision over HTTP unless told otherwise
- **Doing:** connecting the 2.x client to our own 2.x server over Streamable HTTP.
- **Expected:** both ends on the newest revision.
- **Happened:** the client negotiated 2025-11-25. On that revision our `input_required` reply cannot be delivered on
  a stateless connection, so confirmations failed. The client needs `versionNegotiation: { mode: 'auto' }`.
- **What made it slow:** nothing pointed at the revision; the symptom was a failed confirmation.
- **Would help:** log the negotiated revision at connect by default, and say in the client README that the default
  is the conservative one. Severity: medium.

### 4. No supported way for a stateless server to ask an older client
- **Doing:** supporting 2025-11-25 clients, which the hackathon rules name as the minimum.
- **Expected:** some fallback for elicitation.
- **Happened:** a stateless request on the older revision has no channel for the server to ask anything.
  We built our own: the tool returns a sealed five-minute ticket and a `confirm_action` tool redeems it.
- **Would help:** a documented pattern for "confirmation without elicitation", since every action-taking server for
  a voice assistant needs one. Severity: medium.

### 5. Bearer auth: a thrown `Error` becomes a 500
- **Doing:** `requireBearerAuth({ verifier })` with our own token check.
- **Expected:** an invalid token is answered with 401.
- **Happened:** throwing a plain `Error` from the verifier produced 500; it must be `OAuthError` with
  `OAuthErrorCode.InvalidToken`. Separately, a verifier result without `expiresAt` is rejected.
- **Would help:** treat any verifier rejection as `invalid_token` by default; document `expiresAt` as required.
  Severity: low.

### 6. MCP Apps: package line and bundle size
- **Doing:** adding `@modelcontextprotocol/ext-apps` to a project on the 1.x SDK.
- **Expected:** it works with the SDK the hackathon material points to.
- **Happened:** ext-apps 2.x needs the split 2.x packages and Zod 4, so the server had to move to the new line
  first. In the browser, the `App` class with its dependencies bundles to about 600 kB minified, and because a view
  should be self-contained we inline that into each of our four `ui://` documents.
- **What we did:** rebuilt the server on the 2.x packages; the size we accepted.
- **Would help:** a dependency-free build of the view-side `App` (it only needs postMessage and a few schemas), and a
  compatibility table in the README. Severity: medium for size on low-power screens.

### 7. MCP Apps host: tool calls from a view need a server-side proxy
- **Doing:** letting the evening card refresh itself with `app.callServerTool`.
- **Expected:** to pass our MCP client to `AppBridge` and be done.
- **Happened:** our page is in the browser and the MCP client with the bearer token lives on the server, so we
  constructed the bridge with no client and implemented `oncalltool` ourselves, with an allow-list of read-only
  tools. The spec leaves it to the host which tools a view may call; we could not find guidance on a safe default.
- **Would help:** a recommended default (for example: only tools annotated `readOnlyHint`), and a note that several
  bridges on one page each log "Ignoring message from unknown source" for the other frames' messages. Severity: low.

### 8. Nothing tells a view that its data is stale
- **Doing:** keeping the evening card correct after a later tool call (an order) changed the state.
- **Expected:** a notification from host to view that says "the result you are showing has changed".
- **Happened:** a view only ever gets the result of the call that created it. We poll a read-only tool every three
  seconds.
- **Would help:** a host-to-view "refresh" notification, or resource subscriptions surfaced to views. Severity: low.

### 9. Agent Skills: no way to check what a host will do with one
- **Doing:** writing `SKILL.md` so that an agent uses the tools in the right order and never bends the rules.
- **Expected:** a way to run a skill against a reference agent, or at least a validator.
- **Happened:** we wrote our own loader and treat the skill as system instructions. Whether Alexa+ loads the
  references, how much of the body it reads, and how it resolves a conflict between a skill and a tool description
  are unknown to us. We therefore put every rule that matters into the server as well.
- **Would help:** a published checklist of what Alexa+ reads from a skill, and a conformance test. Severity: medium.

### 10. Small things
- pnpm 11 prints "Ignored build scripts: esbuild" and writes a placeholder into `pnpm-workspace.yaml`
  (`esbuild: set this to true or false`) that is not valid until edited.
- Tool annotations have no way to say "this needs the person's confirmation"; we say it in the description and
  enforce it in the handler. `destructiveHint` is not the same thing.

## What we could not test

The Alexa+ preview tools are not available to hackathon participants. So we do not know: which protocol revision
Alexa+ speaks to a self-hosted server; whether it answers `input_required` or elicitation by voice, on screen, or not
at all; whether and how it renders MCP Apps views on Echo Show devices; how it authenticates to a self-hosted
server on behalf of a household; and how it loads Agent Skills. We built for both protocol revisions and kept
every rule in the server because of this.

## Feature requests, in order

1. **A public Alexa+ conformance client** (even a command-line one) that connects to a self-hosted MCP server the way
   Alexa+ does and reports what it would do with each tool, view and confirmation. This would have replaced most of
   our guessing.
2. **A first-class confirmation contract**: an annotation for "needs the person's yes", the decline branch in the
   helpers, and a documented fallback for clients that cannot be asked.
3. **A version-pinned starter** for the hackathon stack: 2.x server, bearer auth, one tool with a view, one tool with
   a confirmation, one test for each protocol revision.
4. **A light view runtime** for MCP Apps and a host-to-view refresh signal.
5. **Purchasing guidance**: how a self-hosted server should represent a quote, a cap and an idempotent order so that
   Alexa+ can present them consistently across skills.

## Would we build with these tools again?

Yes. The multi-round-trip confirmation and MCP Apps together cover what a household agent needs: act only after a
yes, and show the person what they are agreeing to. The rough edges above are about defaults and documentation,
not about the design.
