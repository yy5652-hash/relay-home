# Demo video

Length 2:27, 1920x1080, English, burned-in captions, with a matching `.srt`.

**What is on screen.** After the opening card, everything is a recording of this repository's simulator page running
against its own MCP server on the same machine (`pnpm start`), driven by a script that clicks and types the way a
person would. Nothing is mocked for the film: the cards, the confirmation sheets, the list of MCP calls and their
timings are what the page showed. The agent in the recording is the built-in scripted model, as the film says. The
"under the hood" and closing cards are drawn over the page.

**How it was made.** A headless Chromium plays a step list (say this sentence, click this, move the camera there).
The picture is the browser's own screencast, placed on a 30 fps timeline by frame timestamps; the camera moves are
CSS transforms of the page. The narration is a synthetic voice (Kokoro, Apache-2.0). The quiet bed under the voice is
synthesised from oscillators and noise by our own script; no existing recording, sample or melody is used.

## Narration

| At | Caption |
|---|---|
| 0:01.2 | It is 4:40. School has just moved Mia's pickup to 5:15, and Alex's train is late. |
| 0:07.6 | Relay Home rebuilds the evening, and asks before it acts. |
| 0:12.1 | This page stands in for Alexa+. Behind it are a real MCP server and an Agent Skill. |
| 0:19.4 | One sentence. The agent reads the household, checks helpers and dinners in parallel, and drafts a plan. |
| 0:26.0 | Every card on screen is an MCP Apps view, served by the server. |
| 0:31.5 | Sam would be five minutes late. Lee lives closer, but is not on the school's list. Only Jo may be asked. |
| 0:40.4 | Ask for anyone else, and the server refuses. |
| 0:45.3 | A tap on a card does not act. It goes back through the agent, and the server answers: input required. |
| 0:51.8 | Say no, and nothing happens. |
| 0:55.2 | Only a yes, bound to this exact action, lets it through. |
| 0:59.7 | Jo has been asked. Relay does not call the pickup covered until Jo answers. |
| 1:11.6 | Dinner needs spinach. The shop returns a signed quote, and Relay asks again, for the exact total. |
| 1:19.5 | The order is placed once, inside the weekly grocery cap. The evening card updates itself through the host. |
| 1:28.3 | The household is remembered between sessions, for this page and for any other MCP client with the same token. |
| 1:39.3 | And if Jo could not come? The plan stops, and names no one. It will not reach for the neighbour. |
| 1:46.7 | Under the hood: twelve tools over Streamable HTTP, on the newest protocol revision, with a fallback for older clients. |
| 1:55.0 | The rules live in the server, so no model can talk its way past them. |
| 1:59.0 | In this recording a scripted model follows the skill, so every run is the same. Add a key, and a hosted model takes its place. |
| 2:07.3 | Twenty-six tests cover the rules, both protocol revisions, and the agent. |
| 2:12.8 | The household and the shop are simulated. The protocol, the confirmations and the cards are real, and run from one command. |
| 2:20.8 | Relay Home. A changed pickup should not derail the whole evening. |
