# YouTube publication copy

Published 2026-10-08 12:26 UTC as https://youtu.be/W3LUTcaPIeE (public, channel "yi yu"). "Not made for kids"; altered-content question answered no (a screen recording with a synthetic narrator, disclosed in the description).

**Title** (94 characters)

Relay Home: a household agent for Alexa+ that asks before it acts (MCP, MCP Apps, Agent Skill)

**Description** (1918 characters)

```
Relay Home rebuilds a family evening after a change of plan, and asks before it acts.

School moves a pickup by 45 minutes. One parent's train is late, the other would arrive five minutes after the deadline, and the neighbour who lives closest is not on the school's pickup list. Relay works out who may collect the child and what dinner fits the pantry and the budget, shows the plan as cards, and waits for a yes before it asks anyone or spends anything.

What is in the project
- A self-hosted MCP server over Streamable HTTP (protocol revision 2026-07-28, still serving 2025-11-25 clients), 12 tools
- Confirmation inside the protocol: every tool that acts for the household answers input_required and runs only after the person's yes
- Purchasing with a signed quote, an exact total, a weekly cap and an idempotent order
- MCP Apps views shown by a simulated Alexa+ page that acts as an MCP Apps host
- An Agent Skill that tells the agent how to work
- 30 tests

What is real and what is not
The MCP server, the protocol traffic, the confirmations, the cards and the skill are real. In this recording the agent is Gemini 3.5 Flash-Lite following the skill. The household, the school and the shop are made up: no message is sent and no money moves. The Alexa+ preview tools are not open to hackathon participants, so this runs in a browser page that stands in for Alexa+.

Code (MIT): https://github.com/yy5652-hash/relay-home

Chapters
0:00 4:40 PM: one change, and the evening comes apart
0:15 One sentence, one plan
0:36 The rules live in the server
0:51 Ask first: confirmation inside the protocol
1:21 Pay once, within the weekly cap
1:41 It remembers
1:52 Never the neighbour
2:03 Under the hood
2:28 What is real and what is simulated

Built for the Amazon "Build, Ship, Shape" developer hackathon (Alexa+ track).
Narration: synthetic voice (Kokoro). Music: synthesised for this film; no third-party music.
```
