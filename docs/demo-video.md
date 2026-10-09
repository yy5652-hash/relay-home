# Demo video

Length 2:19, 1920x1080, English, burned-in captions, with a matching `.srt`. This is the third film; it shows
Relay Home 2.1 (the kitchen display, and Jo answering from their own phone).

**What is on screen.** After the opening card, everything behind the graphics is a recording of this repository's
simulator page running against its own MCP server on the same machine, driven by a script that clicks, types and
taps the way a person would, on the display and on the helper's phone. Nothing is mocked for the film: the cards,
the confirmation sheets, the code, the phone page, the "Just in" announcements, the list of MCP calls and their
timings are what the page showed, and the strip at the top counts the calls and confirmations as the page reports
them. The agent in the recording is Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`, free tier) following the skill;
its answers are its own and are reproduced below. The chapter bands, stamps, callouts, the grocery-cap gauge and
the opening, "under the hood" and closing cards are drawn over the page for the film.

**How it was made.** A headless Chromium plays a step list (say this sentence, click this, frame that). The picture
is the browser's own screencast, placed on a 30 fps timeline by frame timestamps. The narration is a synthetic voice
(Kokoro, Apache-2.0). The soundtrack is synthesised from oscillators and noise by our own script; no existing
recording, sample or melody is used. Chapter changes wait for the next bar line, so the cuts fall on the music.
The reply link in the film is built on the hosted copy's address, so the code on screen points at
relay-home.onrender.com; the phone beside the display opened the same page on the recording machine.

## Narration

| At | Caption |
|---|---|
| 0:01.1 | It is 4:40. School has just moved Mia's pickup to 5:15, and Alex's train is late. |
| 0:07.6 | One change, and the whole evening comes apart. |
| 0:11.4 | Relay Home rebuilds it, and asks before it acts. |
| 0:16.8 | This kitchen display stands in for Alexa+. Behind it are a self-hosted MCP server and an Agent Skill. |
| 0:25.1 | One sentence. The agent reads the household, checks helpers and dinners in parallel, and drafts a plan. |
| 0:32.4 | Every card on the screen is an MCP Apps view, served by the server in a sandboxed frame. |
| 0:39.8 | Lee lives closest, but is not on the school's pickup list. Relay will not suggest Lee. |
| 0:47.4 | Asking another adult to collect a child is not something an assistant should do on its own. |
| 0:54.1 | So the tool answers input required, and the question comes to the person. |
| 0:59.3 | Only a yes records the request. The pickup is not covered until Jo says so. |
| 1:07.3 | Relay makes Jo a private link, and shows it as a code for Jo's phone. |
| 1:12.3 | The page behind it holds one question, and can do nothing else. |
| 1:17.1 | Jo taps yes. The display hears it within seconds, and the card now reads: confirmed from their phone. |
| 1:25.5 | Dinner needs spinach. Relay gets a signed quote from the shop and asks for the exact total. |
| 1:32.1 | Yes, and the order is placed once, inside the weekly cap. The evening card updates itself. |
| 1:40.7 | Later, something comes up for Jo. |
| 1:44.5 | Relay draws the plan again. With nobody else on the school list in time, it stops, and names no one. |
| 1:53.1 | Twelve tools over Streamable HTTP, on both protocol revisions. Every rule lives in the server, and thirty-three tests hold them. |
| 2:02.1 | In this recording, Gemini drives the agent through the skill. A Strands agent drives the same server from a terminal. |
| 2:12.0 | A changed pickup should not derail the whole evening. Relay Home: it asks before it acts. |

## The conversation in the film

What the page showed, in order. Relay's lines are the model's own; the two "Just in" lines are the display's
announcements of what Jo did on their phone.

**You:** School moved Mia's pickup to 5:15 and Alex's train is late. Keep dinner under $8.
**Relay:** Jo can collect Mia by 5:00 PM. For dinner, Sam can make chickpea and tomato soup at 6:10 PM using only the pantry items at no extra cost. Shall I ask Jo to pick up Mia?
**You:** Ask Jo
**Relay:** Jo has been asked to pick up Mia and we are awaiting their reply.
**Relay:** Jo confirmed. The pickup is covered.
**You:** Make the pasta and order what we need.
**Relay:** Jo confirmed the pickup, and the spinach has been ordered for $3.20 for store collection at 5:45 PM. Sam will make the tomato and chickpea pasta starting at 6:05 PM.
**Relay:** Jo cannot do it and is left out for today. Nobody on the school pickup list can be there by 5:15 PM. Call the school or an approved adult; Relay will not suggest anyone else.

Calls per turn: get_household, find_pickup_helpers, suggest_dinners, draft_evening_plan / ask_helper, confirmation / draft_evening_plan, quote_groceries, place_grocery_order, confirmation.
