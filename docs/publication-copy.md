# YouTube publication copy

Published 13 October 2026 as https://youtu.be/EhCnOVfZsgE (public, channel "yi yu"): the 2:21 film, uploaded as a 2560x1440
file with the film's own `.srt` as its English captions. It replaces the 2.0 film published on 8 October 2026.

**Title** (94 characters)

Relay Home: a household agent for Alexa+ that asks before it acts (MCP, MCP Apps, Agent Skill)

**Description** (3175 characters)

```
Relay Home rebuilds a family evening after a change of plan, asks before it acts, and lets the person it asks answer from their own phone.

School moves a pickup by 45 minutes. One parent's train is late, the other would arrive five minutes after the deadline, and the neighbour who lives closest is not on the school's pickup list. Relay works out who may collect the child and what dinner fits the pantry and the budget, shows the plan as cards, and waits for a yes before it asks anyone or spends anything. The neighbour it asks gets a private link, shown as a code on the kitchen display; one tap on their phone, and the display says so.

What is in the project
- A self-hosted MCP server over Streamable HTTP (protocol revision 2026-07-28, still serving 2025-11-25 clients), 12 tools
- Confirmation inside the protocol: every tool that acts for the household answers input_required and runs only after the person's yes
- A reply link for the helper, drawn as a QR code by the evening card; the page behind it answers one question and nothing else
- Purchasing with a signed quote, an exact total, a weekly cap and an idempotent order
- MCP Apps views shown by a simulated Alexa+ kitchen display that acts as an MCP Apps host
- Voice in and out on that display: say what changed, hear the answer, and say yes to the confirmation it reads aloud
- An Agent Skill that tells the agent how to work; a second host built with the Strands Agents SDK
- 35 tests, and `pnpm wire`, which prints the consent round trip as it travels

The arrivals chart in the film is the product's own card, drawn to scale from the server's answer. The round trip on the wire is drawn with D3 from this recording's own data, and every number on screen was measured in it.

What is real and what is not
The MCP server, the protocol traffic, the confirmations, the reply link, the cards and the skill are real. In this recording the agent is Gemini 3.5 Flash-Lite following the skill, and its answers are shown and spoken as it gave them. The voices are synthetic: Relay says the text its own page asked to be spoken (some answers are cut short), the person's lines are scripted, and waits for the model are shortened. The household, the school and the shop are made up: no message is sent and no money moves. The Alexa+ preview tools are not open to hackathon participants, so this runs in a browser page that stands in for Alexa+.

Code (MIT): https://github.com/yy5652-hash/relay-home
Try it: https://relay-home.onrender.com

Chapters
0:00 4:40 PM: one change, and the evening comes apart
0:12 Relay Home rebuilds the evening
0:19 Say what changed, out loud
0:40 Who can collect Mia: four adults, one deadline
0:48 Nothing happens without your yes
0:58 Jo answers from their own phone: 2.2 seconds
1:19 Dinner: the exact total, and the evening rebuilt
1:47 What if Jo says no?
1:59 One yes, on the wire
2:09 The same server, driven by a Strands agent

Built for the Amazon "Build, Ship, Shape" developer hackathon (Alexa+ track).
Live action: stock footage from Mixkit (Mixkit Stock Video Free License). Voices: synthetic (Kokoro). Music and sound: synthesised for this film; no third-party music.
```
