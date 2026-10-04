# Relay Home

**Plans change. Home stays together.** A household replanning assistant that connects pickup permissions, calendars, pantry ingredients and a grocery budget through a real MCP server.

Built for the **Alexa+ track** of the Build, Ship, Shape: Amazon Developer Hackathon 2026. The frontend is an independent Alexa+ experience simulation. There is no connection to the gated Alexa+ SDK, an Echo device, Ring, or a live household account.

## Run in two commands

Prerequisite: Node.js 24 or newer and pnpm 11.25.0. From this directory:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm start
```

Open **http://127.0.0.1:4317**. No API key, cloud account, hardware, database setup or usage charge is required. Dependency installation needs internet; the running demo does not make external service calls.

The server binds to loopback only. `PORT=4318 pnpm start` changes its port. `RELAY_DATA_DIR=/absolute/path/to/a-new-folder pnpm start` starts an independent demo household without overwriting the existing one. Run one server process per data directory.

## Fast judging path

1. Select **Plan under $8**, then open **Inside the plan** to see actual MCP tool calls and timing. The proposal uses an approved on-time helper and stays unconfirmed.
2. Request **Plan dinner under $2 in 20 minutes**. Review the changed meal, confirm the local plan, and notice that pickup still awaits a real acknowledgment.
3. Use **Undo saved plan**. Select **No approved helper available** and replan to see a blocker instead of an unauthorized assignment. For recovery, select **Sam's meeting ends early**, confirm Sam's plan, then record **Sam can't make it**; Jo becomes a new draft requiring approval.

The browser is a simulator, not an Alexa integration. `pnpm check:mcp` independently discovers and calls the running server's MCP tools.

## Try the story

1. A school notice moves pickup to 5:15 PM. Alex's train is delayed; Sam's meeting also creates a conflict.
2. Click **Plan under $8**. Relay discovers tools and calls them over Streamable HTTP. It recommends asking approved helper Jo, and a 25-minute pantry-first dinner with $3.20 in estimated additions.
3. Open **Inside the plan** and **Why this works**. Trace durations come from actual calls. Rejected candidates and their reasons are available through **Explain the trade-offs**.
4. Type **Plan dinner under $2 in 20 minutes**. Relay changes the meal to a zero-addition soup.
5. **Confirm local plan** saves tasks, preferences and a shopping list. Pickup remains **awaiting acknowledgment**. Nothing is sent or purchased.
6. Reload the page or restart the server. The saved plan, conversation and activity survive.
   Ask **What do you remember?** to distinguish an unsaved draft, a stale preview and a saved local plan across sessions.
7. Click **Undo saved plan**. Previous tasks, preferences and shopping data are restored.
8. Click **Jo can't make it**, or switch to **No approved helper available**. Relay surfaces a blocker and removes the confirm action. It never substitutes an unapproved neighbor.
9. Switch to **Sam's meeting ends early** and replan. An on-time parent is preferred to a neighbor. A changed scenario makes old previews stale.
10. Confirm Sam's local plan, then select **Sam can't make it**. Relay restores the saved plan, marks Sam unavailable for this pickup plan, and suggests Jo for a new review. Calendar free time and pickup availability are labeled separately. This records a reported refusal; the app does not contact Sam or Jo.

The conversation supports a small, explicit grammar: plan/replan, budget (`under $8`), duration (`20 minutes`), named availability (`Jo is unavailable` / `Jo is available`), explanation and recap. It is a deterministic constrained planner, **not an LLM** and not an unrestricted voice assistant. No microphone or speech recognition is included.
Short follow-ups such as `Jo is available`, `Jo is not available` and `Jo can’t make it` work without adding “replan.” They retain the current valid draft’s budget and cooking-time limit, including after a server restart, and never confirm the replacement automatically.
Out-of-range or malformed numeric constraints are rejected with a clear prompt to restate them; they are not silently clamped into a different budget or cooking time.
Explanations label stale, expired and historical plans before describing their trade-offs, so an old answer is not presented as a current proposal.

## MCP: real runtime integration

- Official `@modelcontextprotocol/sdk` 1.31.0, imported and called by both server and simulator client.
- Endpoint: `http://127.0.0.1:4317/mcp`.
- Streamable HTTP with stateless JSON responses. HTTP GET/DELETE return 405, as allowed for this mode.
- A raw integration test explicitly negotiates **2025-11-25**, the version named in the hackathon rules.
- Tools: `household_context`, `preview_evening`, `explain_plan`.
- `household_context` returns the latest draft or saved plan alongside current local tasks and shopping. An MCP client can resume after a server restart; omitted preview constraints inherit the latest unexpired draft or saved preferences.
- A separate MCP client cannot create a competing draft while a local plan is saved; the owner must undo that plan first.
- Tool schemas validate budgets, durations, helper names and plan IDs.
- MCP tools can read context and produce drafts. Confirmation is a separate trusted frontend action, not an agent-callable tool.

The local bearer token is generated in `.data/mcp-token` with restrictive permissions. Read it locally when connecting another MCP client; never paste it into a repository or submission. An example runtime check is included:

```sh
pnpm check:mcp
```

With a custom data directory or port, set `RELAY_MCP_TOKEN` and `RELAY_MCP_URL` for that check. The demo does not implement production OAuth or multi-user authorization. Do not expose this local prototype to the internet.

## Architecture

Browser → same-origin chat endpoint → official MCP client → authenticated Streamable HTTP endpoint → tool schemas → constrained planner → atomic local JSON store.

Human review → CSRF-protected confirmation endpoint → revision / expiry / blocker checks → local task and shopping update → append-only activity within the saved state. A reported helper refusal restores the previous local tasks and shopping list, excludes that helper from the next pickup draft and requires a new confirmation.

`src/planner.js` contains constraint evaluation, ranking and reversible transitions. `src/mcp.js` exposes tools. `src/agent.js` orchestrates discovery/context/planning/explanation. `src/store.js` writes to a temporary file and renames it before publishing new state in memory. `src/server.js` provides local HTTP boundaries and the UI. `public/` contains a responsive, dependency-free frontend.

Preview validity is ten minutes of real elapsed time. Household schedule evaluation uses a fixed synthetic demo clock at 4:40 PM on October 2, 2026; the UI labels it explicitly. A scenario update increments the household revision and invalidates old drafts. Duplicate confirmation does not duplicate tasks. Undo refuses to overwrite intervening changes.
After a draft expires, a new chat request starts from saved household preferences rather than silently reusing draft-only budget or helper exclusions; the user can restate either constraint.

## Verification

```sh
pnpm test
```

24 tests cover constraints, unavailable helpers, meal budgeting, parent preference, expiry and draft-constraint reset, stale revisions, idempotency, undo and helper-refusal recovery, atomic write failures, corrupt-state preservation, MCP discovery and version negotiation, input validation, Host/Origin checks, token enforcement, cross-session MCP draft recovery and accurate draft/saved/stale recaps. Tests create isolated temporary households and bind ephemeral loopback ports.

Manual browser checks cover preview, confirmation, reload, undo, helper-refusal replanning, blocked planning, real tool traces and a 390-pixel mobile viewport. See `docs/validation.md` and `docs/screenshots/`.

## Honest scope and limits

- Every person, location, calendar entry, pantry portion, travel duration and price is synthetic.
- No live calendar, school, shopping, message, device, Alexa or AWS integration is claimed.
- No message to Jo is sent. A local assignment does not establish real-world pickup coverage.
- Pantry quantities represent a demo meal portion; stock and dietary suitability are not independently verified.
- Travel and ingredient availability are assumptions, not live estimates or guaranteed purchases.
- The planner is a bounded prototype, not a safety, medical or emergency system.
- No user interviews, deployment, adoption numbers, official score or award are claimed.
- The data store supports one local household and one server process. Deployment would need authentication, authorization, migrations and concurrency handling.

## Submission status

The owner-selected Heart narration edition is published at https://youtu.be/avoHrgCZtCM and available as `docs/relay-home-heart.mp4` (164.45 seconds), with aligned English captions in `docs/relay-home-heart.srt` and generation details in `docs/narration-provenance.json`. The original local video and its public link, https://youtu.be/MR2rbJVQxB8, are retained unchanged.

Local runnable prototype and materials are prepared. The owner authorized the private repository at https://github.com/yy5652-hash/relay-home and separately authorized the [current public demonstration video](https://youtu.be/avoHrgCZtCM), published October 3, 2026 with English subtitles after action-time confirmation of the upload terms. YouTube Studio confirmed publication and retained Public after refresh. Signed-in playback progressed; independent signed-out playback is not yet verified. On October 4, a fresh Devpost project page showed Submitted and 5/5 steps done, independently confirmed by the official My projects listing for entry 1216490, [Relay Home](https://devpost.com/software/relay-home). This verifies submission, not organizer eligibility approval, a judging score or reviewer repository access. Following explicit owner authorization, seven reviewer collaborator invitations were sent on October 4. A refreshed GitHub access page confirms the repository remains private, with seven pending invitations and zero accepted collaborators; sending invitations does not establish accepted access. See `docs/submission.md` for entry copy and remaining access requirements, `docs/product-feedback.md` for observed feedback and `docs/publication-copy.md` for video publication details.

No open-source license has been selected by the owner; the source repository remains private. The owner has authorized read/write collaborator access for the specified reviewers, and all seven invitations have been sent. Accepted access remains unverified while those invitations are pending. Submission on Devpost does not grant access to GitHub automatically. The submitted version does not enter the Open Source or AWS Builder mini challenge.

## Sources

- [Official rules](https://amazonappdev2026.devpost.com/rules), checked October 2, 2026.
- [Official FAQ](https://amazonappdev2026.devpost.com/details/faqs), including local-run judging and gated Alexa+ tools.
- [Organizer update on judging](https://amazonappdev2026.devpost.com/updates/46456-got-an-idea), emphasizing workflows and context across sessions for Alexa+.
- [MCP 2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
- [Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).
- [Federal Reserve 2024 household survey: care work and living arrangements](https://www.federalreserve.gov/publications/2025-economic-well-being-of-us-households-in-2024-care-work-and-living-arrangements.htm), used only as external need context, not product-validation evidence.

Dependency licenses remain the property of their respective authors. Original interface artwork is made from CSS and text; no external photos, music or Amazon logos are bundled.
