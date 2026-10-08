# Demo video

Length 2:44, 1920x1080, English, burned-in captions, with a matching `.srt`.

**What is on screen.** After the opening card, everything behind the graphics is a recording of this repository's
simulator page running against its own MCP server on the same machine, driven by a script that clicks and types the
way a person would. Nothing is mocked for the film: the cards, the confirmation sheets, the list of MCP calls and
their timings are what the page showed, and the strip at the top counts the calls and confirmations as the page
reports them. The agent in the recording is Gemini 3.5 Flash-Lite (gemini-3.5-flash-lite, free tier) following the
skill; its answers are its own and are reproduced below. The chapter bands, stamps, callouts, the grocery-cap gauge
and the opening, "under the hood" and closing cards are drawn over the page for the film.

**How it was made.** A headless Chromium plays a step list (say this sentence, click this, frame that). The picture
is the browser's own screencast, placed on a 30 fps timeline by frame timestamps. The narration is a synthetic voice
(Kokoro, Apache-2.0). The soundtrack is synthesised from oscillators and noise by our own script; no existing
recording, sample or melody is used. Chapter changes wait for the next bar line, so the cuts fall on the music.

A hosted model does not answer the same way twice. We recorded several takes while fixing what the model's mistakes
showed us (see the friction log, items 10 and 11) and kept the first take in which every answer matched what had
actually happened.

## Narration

| At | Caption |
|---|---|
| 0:01.1 | It is 4:40. School has just moved Mia's pickup to 5:15, and Alex's train is late. |
| 0:07.6 | One change, and the whole evening comes apart. |
| 0:11.4 | Relay Home rebuilds it, and asks before it acts. |
| 0:16.8 | This page stands in for Alexa+. Behind it are a real MCP server and an Agent Skill. |
| 0:23.9 | One sentence. The agent reads the household, checks helpers and dinners in parallel, and drafts a plan. |
| 0:31.4 | Every card on screen is an MCP Apps view, served by the server. |
| 0:37.8 | Sam would be five minutes late. Lee lives closer, but is not on the school's list. Only Jo may be asked. |
| 0:46.2 | Ask for anyone else, and the answer is no. |
| 0:53.9 | A tap on a card does not act. It goes back through the agent, and the server answers: input required. |
| 1:00.2 | Say no, and nothing happens. |
| 1:06.2 | Only a yes, bound to this exact action, lets it through. |
| 1:10.4 | Jo has been asked. Relay does not call the pickup covered until Jo answers. |
| 1:24.3 | Dinner needs spinach. The shop returns a signed quote, and Relay asks again, for the exact total. |
| 1:34.1 | The order is placed once, inside the weekly grocery cap. The evening card updates itself through the host. |
| 1:43.4 | The household is remembered between sessions, for this page and for any other MCP client with the same token. |
| 1:56.5 | And if Jo drops out? The plan stops, and names no one. It will not reach for the neighbour. |
| 2:04.5 | Under the hood: twelve tools over Streamable HTTP, on the newest protocol revision, with a fallback for older clients. |
| 2:12.5 | The rules live in the server, so no model can talk its way past them. |
| 2:16.4 | In this recording, Gemini drives the agent through the skill. With no key at all, a built-in scripted model takes its place. |
| 2:23.9 | Thirty tests cover the rules, both protocol revisions, and the agent. |
| 2:29.2 | The household and the shop are simulated. The protocol, the confirmations and the cards are real, and run from one command. |
| 2:38.1 | Relay Home. A changed pickup should not derail the whole evening. |

## The conversation in the recording

**Person:** School moved Mia's pickup to 5:15 and Alex's train is late. Keep dinner under $8.

**Relay:** Jo can collect Mia by 5:00 PM. For dinner, Sam can make chickpea and tomato soup at 6:10 PM using only the pantry, so it costs nothing. Shall I ask Jo to pick up Mia?

**Person:** Ask Lee

**Relay:** Lee is not on the school pickup list, so they cannot collect Mia. Jo is eligible to help instead. Shall I ask Jo?

**Person:** Ask Jo

**Relay:** Nothing was done.

**Person:** Ask Jo

**Relay:** Jo has been asked.

**Person:** Jo confirmed

**Relay:** Jo has confirmed the pickup. Sam will make chickpea and tomato soup at 6:10 PM using pantry items at no cost.

**Person:** Make the pasta and order what we need.

**Relay:** I've ordered the spinach for $3.20 from Corner Market for collection from 5:45 PM. Sam will make tomato and chickpea pasta at 6:05 PM, and Jo is confirmed to pick up Mia at 5:15 PM.

**Person:** What do you remember?

**Relay:** I remember your vegetarian diet preference, the $40.00 weekly grocery cap ($24.60 spent this week), and that Jo is confirmed to pick up Mia at 5:15 PM. I also remember the current plan for tomato and chickpea pasta with spinach ordered for collection from 5:45 PM.

**Person:** Jo can't make it after all

**Relay:** Nobody else is eligible to collect Mia by 5:15 PM. You will need to contact the school or an approved adult directly.
