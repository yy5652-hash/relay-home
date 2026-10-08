# Demo video

Length 2:38, 1920x1080, English, burned-in captions, with a matching `.srt`.

**What is on screen.** After the opening card, everything behind the graphics is a recording of this repository's
simulator page running against its own MCP server on the same machine, driven by a script that clicks and types the
way a person would. Nothing is mocked for the film: the cards, the confirmation sheets, the list of MCP calls and
their timings are what the page showed, and the strip at the top counts the calls and confirmations as the page
reports them. The agent in the recording is the built-in scripted model, as the film says. The chapter bands, stamps,
callouts, the grocery-cap gauge and the opening, "under the hood" and closing cards are drawn over the page for the film.

**How it was made.** A headless Chromium plays a step list (say this sentence, click this, frame that). The picture
is the browser's own screencast, placed on a 30 fps timeline by frame timestamps. The narration is a synthetic voice
(Kokoro, Apache-2.0). The soundtrack is synthesised from oscillators and noise by our own script; no existing
recording, sample or melody is used. Chapter changes wait for the next bar line, so the cuts fall on the music.

## Narration

| At | Caption |
|---|---|
| 0:01.1 | It is 4:40. School has just moved Mia's pickup to 5:15, and Alex's train is late. |
| 0:07.6 | One change, and the whole evening comes apart. |
| 0:11.4 | Relay Home rebuilds it, and asks before it acts. |
| 0:16.8 | This page stands in for Alexa+. Behind it are a real MCP server and an Agent Skill. |
| 0:24.0 | One sentence. The agent reads the household, checks helpers and dinners in parallel, and drafts a plan. |
| 0:31.1 | Every card on screen is an MCP Apps view, served by the server. |
| 0:37.8 | Sam would be five minutes late. Lee lives closer, but is not on the school's list. Only Jo may be asked. |
| 0:46.2 | Ask for anyone else, and the server refuses. |
| 0:52.0 | A tap on a card does not act. It goes back through the agent, and the server answers: input required. |
| 0:58.3 | Say no, and nothing happens. |
| 1:01.7 | Only a yes, bound to this exact action, lets it through. |
| 1:05.3 | Jo has been asked. Relay does not call the pickup covered until Jo answers. |
| 1:18.6 | Dinner needs spinach. The shop returns a signed quote, and Relay asks again, for the exact total. |
| 1:27.4 | The order is placed once, inside the weekly grocery cap. The evening card updates itself through the host. |
| 1:36.7 | The household is remembered between sessions, for this page and for any other MCP client with the same token. |
| 1:48.9 | And if Jo could not come? The plan stops, and names no one. It will not reach for the neighbour. |
| 1:56.9 | Under the hood: twelve tools over Streamable HTTP, on the newest protocol revision, with a fallback for older clients. |
| 2:04.9 | The rules live in the server, so no model can talk its way past them. |
| 2:08.7 | In this recording a scripted model follows the skill, so every run is the same. Add a key, and a hosted model takes its place. |
| 2:16.8 | Twenty-six tests cover the rules, both protocol revisions, and the agent. |
| 2:23.5 | The household and the shop are simulated. The protocol, the confirmations and the cards are real, and run from one command. |
| 2:32.4 | Relay Home. A changed pickup should not derail the whole evening. |
