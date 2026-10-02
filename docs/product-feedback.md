# Product feedback and friction log

Prepared October 2, 2026. Review before submitting. This is feedback on observed documentation and the tools actually used; it does not claim hands-on testing of gated Alexa+ tooling.

## Tools used and purpose

- Official MCP TypeScript SDK 1.31.0: real server registration, Streamable HTTP transport, client discovery and tool calls.
- MCP 2025-11-25 transport specification: protocol-version, response-mode and Origin-check requirements.
- Express 5.1.0: local HTTP endpoints and static app serving.
- Zod 3.25.76: tool and endpoint input validation.
- Node.js 24.19.0 and its test runner: runtime and unit/integration verification.
- Devpost official rules and FAQ: track selection and judging/submission requirements.

No gated Alexa+ Category SDK, MCP Toolkit, Alexa CLI, Web Simulator, Ring SDK, Bee data, AWS runtime service, or Kiro Crew was used.

The MCP SDK was the track-relevant runtime tool and is the focus of the detailed feedback below. For the supporting tools: Express made local route and static UI setup straightforward; Zod supplied clear input boundaries for tool and HTTP requests; Node's built-in test runner covered domain and real HTTP behavior without another test framework. We observed no product defects in these three supporting tools. They were easy to start with existing documentation and we would use them again for a small local prototype. This is not a claim that we tested their wider feature sets or production behavior.

## What worked well

The official MCP SDK supported a real client/server round trip with a small tool surface. Structured tool results and explicit schemas allowed the same planner to serve both the simulator and an independent test client. Stateless JSON mode kept a local-only demo straightforward. The official FAQ explicitly clarified that local execution plus a demo video is sufficient and that gated Alexa+ preview tools are not necessary.

## What needs work

The hackathon rules name MCP 2025-11-25, while the SDK repository's main documentation points to a newer SDK/specification line. A pinned, hackathon-specific sample would reduce the effort needed to choose the right package and verify protocol compatibility. We followed the maintained v1 line and wrote an explicit 2025-11-25 negotiation test.

## Onboarding

The first dependency lookup failed because the local execution environment blocked network name resolution. Retrying with approved network access resolved installation. The first local HTTP test also encountered a local listener restriction and exposed insufficient error handling in our own server startup. We corrected our startup error handling and ran the HTTP tests with local listener permission. These were environment/application issues, not established MCP or Alexa platform defects.

## Would we build with these tools again?

Yes, for the open MCP SDK and independent simulator workflow: the typed tool interface and real transport are useful for inspectable agent actions. We cannot assess the gated Alexa+ SDK firsthand. We would evaluate it when access is available rather than claiming experience with it now.

## Friction log 1 — Track/version onboarding

- Task: select an Alexa+ implementation route matching the hackathon's protocol requirement.
- Steps: read the rules, official FAQ, SDK main README and maintained v1 Streamable HTTP example.
- Expected: a single pinned starter aligned with the hackathon requirement.
- Observed: the rules specify 2025-11-25; SDK main documentation describes a newer major/spec line; gated preview tools are unavailable to participants.
- Severity: Important, documentation/onboarding friction.
- Workaround: use SDK 1.31.0 from the maintained v1 line and verify exact protocol negotiation in an integration test; build an independent web simulator.
- Suggested improvement: publish a version-pinned Alexa+ hackathon starter with a runnable `initialize`/`tools/list`/`tools/call` check and a clearly labeled simulated-experience route.
- Evidence: official rule/FAQ and SDK URLs in README; `test/integration.test.js` checks exact negotiation.
- Qualification: the gating/version issue is documentary evidence; no failed attempt to access or install gated tools is claimed.

## Friction log 2 — Proposal versus confirmation examples

- Task: design a household workflow that proposes actions but requires human review for changes.
- Steps: implement MCP tool previews, then implement confirmation, expiry, stale-revision checks and undo outside the tool surface.
- Expected: a reference workflow showing how an MCP tool proposal can remain separate from a user-approved, reversible action across turns.
- Actual: the SDK supplied tool registration and transport, while this project had to define its own consent and state-transition contract. This is a documentation/example request derived from development, not a claim that the SDK has a bug.
- Severity: Important for this use case.
- Workaround: agent-callable tools cannot confirm; the frontend sends an authenticated-by-origin/CSRF local request referencing an immutable draft ID.
- Suggested improvement: an official multi-turn sample with reversible drafts, explicit confirmation and replay protection.
- Evidence: `src/planner.js`, `src/mcp.js`, confirmation/recovery tests.

## Feature requests

1. Critical for onboarding: version-pinned, publicly accessible Alexa+ hackathon MCP starter.
2. Important: a documented reference pattern for preview → consent → commit → compensation.
3. Nice-to-have: a simulator trace view that displays structured results and negotiated protocol version.

Do not report a bonus as earned. The rules describe a possible friction-log bonus of up to 10%; organizers decide whether this feedback qualifies.
