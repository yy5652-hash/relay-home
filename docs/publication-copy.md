# Publication copy — owner review required

Status: copy prepared for owner review; no public YouTube/Vimeo upload or publication. The owner authorized the private GitHub repository below, but reviewer access has not been granted or verified. The owner must review the entire video and make the final public video publication decision.

## Suggested video title

Relay Home | A consent-first household planner with a real MCP server

## Suggested video description

A school pickup moves earlier. Relay Home checks approved helpers, dinner time, pantry ingredients and a grocery budget, then presents one reviewable evening plan. A tighter budget changes dinner. If nobody approved can arrive on time, Relay explains the blocker. If a proposed helper later declines, the household owner can record that response and review a new proposal.
After a page reload, Relay can distinguish that new unsaved proposal from earlier local changes.

The web interface is an independent Alexa+ experience simulation. It calls a working, self-hosted MCP server over Streamable HTTP; the planner is deterministic and uses synthetic household data. No live Alexa, school, calendar, messaging, shopping or device account is connected. Saving a local plan does not send a message or confirm that pickup is covered.

Source and local run instructions: https://github.com/yy5652-hash/relay-home (private; reviewer access still to be arranged).

Chapters (approximate scene starts):
- 0:00 The changed pickup
- 0:14 Real MCP calls and trade-offs
- 0:33 Budget and cooking-time replanning
- 0:51 Explicit local confirmation
- 1:07 State after refresh
- 1:19 Undo
- 1:29 No safe pickup option
- 1:41 New calendar context
- 1:57 Reported refusal and fresh review
- 2:13 Draft versus saved-plan memory

Built for the Alexa+ primary track of the Build, Ship, Shape: Amazon Developer Hackathon 2026. This is a prototype, not a production caregiving or emergency service.

## Suggested repository summary

Consent-first household replanning prototype with a self-hosted MCP server, Streamable HTTP, a stateful web simulator and synthetic pickup, dinner and budget scenarios.

## Owner publication check

1. Review the complete 155.09-second video and the English narration; confirm it represents the code being submitted and includes no unapproved content.
2. The owner chose a private repository. Obtain separate authorization and verify access for the required Amazon and Devpost reviewers near submission time. No reviewer invitation has been sent.
3. After separate owner approval, upload the MP4 to YouTube or Vimeo, optionally attach the SRT, and set visibility to public. Do not treat an upload spinner, a GitHub video file or a private draft as public video publication.
4. Open the final video URL while signed out to verify public playback, English audio, complete duration and chapter order. Paste the verified URL into the Devpost submission.
5. The owner handles Devpost eligibility, identity, ownership, legal acceptance and final submission; verify the resulting entry and receipt before calling the competition entry complete.
