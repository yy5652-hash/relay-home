# Submission copy — owner review required

Status: local draft, not submitted. Intended primary track: **Alexa+**, working self-hosted MCP server with an independent web simulator. Do not select AWS Builder or Open Source for the current prototype.

## Project name

Relay Home

## Tagline

A changed pickup time should not derail the whole evening. Relay reconnects the plan, explains the trade-offs, and waits for your say-so.

## Inspiration

A family schedule is a chain of small dependencies. If school pickup changes, a parent's calendar, another caregiver's availability, dinner preparation and grocery needs can change with it. A reminder can identify the problem without helping a household work through it.

Relay explores a conversational household workflow that converts a disruption into a reviewable plan. The prototype focuses on one concrete evening so the decisions, constraints and failure cases can be inspected rather than hidden behind a broad assistant promise.

## What it does

Relay combines a synthetic calendar, an approved pickup list, pantry portions and a grocery budget. It checks who can arrive on time, explains why other candidates do not work, and pairs the pickup proposal with a pantry-first dinner. A smaller budget or shorter cooking window changes the meal. If no approved person can make pickup, the plan stays blocked. If a helper later declines, the owner can record that response and review a new proposal that excludes that helper.

This is a multi-step, stateful workflow rather than a single-turn answer. A budget change replans dinner without losing pickup context; a helper's reported refusal reopens the saved plan and excludes that helper; the conversation and local plan survive an app restart. Asking what Relay remembers distinguishes an unsaved draft, a stale preview and a saved local plan. Every proposed action remains a draft until the user confirms it. Confirmation saves local tasks and a shopping list, while pickup remains awaiting a real helper's acknowledgment. Undo restores the previous local state. No message, purchase or device command is sent by this prototype.

In the demo's 5:15 PM pickup scenario, approved helper Jo can arrive at 5:00; parent Sam arrives five minutes late, and faster neighbor Lee is not authorized. Relay proposes Jo but does not claim pickup is covered. With an $8 grocery cap it proposes a pantry-first pasta with $3.20 in additions; changing the request to $2 and 20 minutes switches dinner to a zero-addition soup. Removing Jo without changing the calendar produces a blocker, not an unsafe replacement. When Sam's meeting ends early, a new plan prefers the on-time parent; recording Sam's later refusal restores the local tasks and makes Jo a fresh, unconfirmed proposal. These are synthetic, reproducible outcomes, not field results.

## Who it is for and why it matters

The intended user is a household coordinating time-sensitive pickup among parents and already-approved helpers. A changed school pickup is not just another reminder: the proposed person must be authorized and able to arrive by the deadline, while dinner and grocery choices still fit the evening. Relay presents one reviewable response to that chain of constraints instead of leaving the household to reconcile separate messages and lists. If a helper later declines, the owner can record that response and review a replacement without treating the first local assignment as real-world coverage.

As context for this use case, the [Federal Reserve's 2024 household survey](https://www.federalreserve.gov/publications/2025-economic-well-being-of-us-households-in-2024-care-work-and-living-arrangements.htm) found that 46% of U.S. adults living with their own children under 13 used some unpaid childcare, and 6% reported care by a nonrelative such as a friend or neighbor. Those figures show that care networks extend beyond parents; they do not measure last-minute pickup changes, demand for Relay, or benefits from this prototype.

We have not measured household demand or saved time. A credible next validation would recruit consenting households and measure time to a feasible plan, the share of suggestions rejected by policy or availability, how often an accepted helper actually acknowledges pickup, and whether people understand the difference between a draft, a locally saved task and a confirmed real-world arrangement.

## How we built it

The implementation uses Node.js 24, Express, Zod and the official MCP TypeScript SDK. The simulator's server-side client discovers tools and calls `household_context`, `preview_evening` and `explain_plan` over authenticated Streamable HTTP. The context tool exposes the latest draft or saved plan and current local tasks, so another MCP client can resume after a restart. Omitted preview constraints inherit the latest unexpired draft or saved preferences. An integration test negotiates protocol version 2025-11-25 explicitly.

The planner is deterministic: filter pickup candidates by authorization, availability and arrival deadline; prefer a feasible parent over a neighbor; filter meals by dietary preference, cooking time, cook availability and budget; then rank meals by pantry coverage and cost. It is not an LLM. The conversational layer deliberately supports a limited grammar and states that limit.

Drafts carry a household revision and a ten-minute expiry. Confirmation checks both, rejects blockers and is idempotent. State transitions are written atomically before they become visible in memory. MCP cannot invoke confirmation; it stays behind a separate user control.

## Challenges

The official Alexa+ preview tools are unavailable to hackathon participants, so we followed the self-hosted MCP and independent simulator route described in the official FAQ. We made the tool connection visible in the interface and verified it with the SDK client as well as raw protocol negotiation.

Another challenge was making failure useful. When all approved caregivers are unavailable, choosing a nearby but unauthorized person would produce a convincing-looking yet invalid plan. Relay instead explains the unmet constraint and asks for a human decision.

## Accomplishments

A locally runnable end-to-end workflow with visible MCP calls, constrained replanning, explicit review, persistent state, undo and helper-refusal recovery. Twenty-four automated tests pass, including real HTTP/MCP integration, cross-session draft recovery, accurate recaps and rejected unsafe or stale transitions. An extracted copy of the delivery ZIP was installed and tested separately; its UI and independent MCP client also ran on a new loopback port. Manual browser checks verify the desktop workflow, refusal-to-replan path and mobile layout.

## What we learned

A useful household assistant needs more than a fluent answer. It needs a distinction between a proposal and a real-world commitment, a clear explanation of rejected options, and a reliable way to recover from changes. Tool observability also makes a simulator much easier to evaluate and debug.

## What's next

Validate the workflow with consenting households; measure time to repair a schedule disruption; add authorized calendar connectors; replace fixed travel estimates with a documented provider; and add explicit caregiver acknowledgment. Broader natural-language understanding could be added without moving policy checks or confirmation into the model. These are planned improvements, not completed integrations.

## Built with

JavaScript, Node.js, Express, Zod, Model Context Protocol, HTML, CSS, Node test runner.

## Submission fields and remaining gates

- GitHub repository URL: https://github.com/yy5652-hash/relay-home (private; reviewer access has not been granted or verified).
- The owner authorized creating this private repository and uploading the reviewed project, and separately authorized public video publication. Reviewer invitations and final competition submission remain unauthorized.
- Current public demo video: https://youtu.be/avoHrgCZtCM — Heart edition published October 3, 2026 with Kokoro synthetic English narration, burned-in captions and uploaded timed English SRT. YouTube Studio retained Public after refresh. Signed-in playback progressed; independent signed-out playback remains to be verified. The local source is 164.45 seconds, below three minutes. The original edition remains public at https://youtu.be/MR2rbJVQxB8.
- Primary track: Alexa+.
- Mini challenges: none for this version.
- Product feedback: use `product-feedback.md`, reviewing its evidence labels.
- Entrant/team, eligibility, ownership and legal declarations: owner must complete personally.
- Final Devpost submission and receipt: not completed.

This wording describes the current prototype. It makes no claim of official Alexa+ integration, live service orchestration, user validation, or production readiness. AI coding assistance was used in implementation and documentation; the owner should review and be able to explain the work before making originality/ownership declarations.
