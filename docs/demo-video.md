# Demo video

Length 2:21, 1920x1080, English, burned-in captions, with a matching `.srt`. It shows Relay Home 2.3: a person
talks to the kitchen display, Relay answers aloud, and Jo answers from their own phone. It opens and closes on
live action.

**The film is about one picture: an evening is a line of dominoes.** The line comes down in the opening, stands up
again when the product is named, stands up once more at the moment Jo says yes, starts to go and stops when Jo
drops out, and is standing in the last shot.

**The brief it was cut to: a piece of craft, and a piece of evidence.**

*Craft.* Real objects filmed on black, in one cold, low-colour grade with grain, so the live action and the dark
interface sit in one world. Inside the product the camera shows one thing at a time: the card being talked about
is lit and everything around it goes dark.

| At | Shot | What it says |
|---|---|---|
| 0:00 | An hourglass, sand running. Type: "4:40 PM", then "Mia's pickup moved to 5:15 · 35 minutes from now". | The deadline. |
| 0:04 | An empty platform, a train's lights far down the tunnel. Type: "Alex · Delayed · train arrives 6:10 PM". | The parent who cannot be there. |
| 0:08 | A line of dominoes; on "One change." the first one goes and the line comes down. | The evening comes apart. |
| 0:11 | **The same shot, backwards**: the line stands up again, and the name appears over it. | Relay rebuilds the evening, and asks before it acts. |
| 0:19 | The whole kitchen display in its frame, the helper's phone asleep beside it, marked "Simulated Alexa+ experience". The person presses the microphone and says what changed; the words appear as they are said. Then the evening card alone, and Relay answers aloud. | It is spoken to, and it speaks. |
| 0:40 | The product's own card: four adults drawn against the deadline, to scale. | The rule: not on the school's list, never suggested. |
| 0:48 | "Ask Jo." Relay reads its question out and listens; "Yes." | Nothing is asked of anyone without a yes. |
| 0:58 | Jo's private reply link, alone on screen. | How the question reaches Jo, and that this demo sends nothing. |
| 1:05 | A hand and a phone against a window (a hard cut, then back). Jo's page alone: the tap, a beat of silence. The pickup tile alone: "Asked · waiting" turns to "Confirmed from their phone", with the one large number of the film beside it, the seconds from Jo's tap to this screen. Then the dominoes stand up again. | **The one pause of the film** (the card turns at 1:13.0). Two people agree, each on their own device. |
| 1:19 | "Make the pasta, and order what we need." Relay reads the exact total; "Yes." The week's grocery cap moves from $18.60 to $15.40. | Money: asked first, spent once, inside the cap. |
| 1:34 | The hourglass again, sand still in it: "Rebuilt in N s", and under it what the server now holds. | The evening, rebuilt, with time to spare. |
| 1:46 | "What if Jo says no?" over the line starting to go. Jo drops out on their phone; the tile turns to "Nobody eligible"; Relay says it will not suggest anyone else; the dominoes **stop**. | The other case, marked as a what-if: it stops, and names no one. |
| 1:59 | The proof, last and large: one yes drawn on the wire with this take's times, then three lines of a terminal session of the same server under a Strands agent, and the upstream pull request. | |
| 2:14 | The line of dominoes, standing; nothing moves. "Relay Home. It asks before it acts." | |

Amber is used for one thing only, the deadline, in the type as in the product's card. A click is shown: a ring
from the pointer and a glow on what was pressed. Sound: a clock's tick under the opening, the dominoes going down
and, reversed, coming back up, then a soft bed that stops for the moment that matters. On Jo's phone the clock
ticks again, once a second, and stops at the tap; then two seconds of nothing, and the card turns. All of it is
synthesised. The mix is at -14 LUFS with no peak above -1 dBTP.

**What was done to the recording, and is said in the film's last card.**

- *The voices.* There are three, all synthetic (Kokoro): a narrator, the person in the kitchen, and Relay. In the
  product, voice mode uses the browser's speech recognition and speech synthesis. A headless recording has neither
  a microphone nor a loudspeaker, so the film puts stand-ins in before the page loads (`speech.js` in the film
  tooling): a recogniser that is fed the person's sentences word by word, and a synthesiser that keeps what the
  page asks to be spoken. The page's own voice code then runs unchanged: the microphone button, the words
  appearing in the box, Relay reading each confirmation out and listening for yes or no. Every sentence in Relay's
  voice is text the page asked to be spoken in this take (the model's answers, the server's questions and
  announcements). The person's sentences are scripted.
- *Some of Relay's answers are cut short.* After "Yes" to asking Jo the film voices only the first sentence of the
  answer, of the order's answer the first two, and of the announcement that Jo dropped out only the last ("Call the
  school or an approved adult; Relay will not suggest anyone else."); the rest is on screen. A sentence longer than
  about a hundred characters is said in two breaths.
- *Waits are shortened.* Time spent waiting for the model or the server is cut out of the picture and the sound,
  6.1 s in 3 places in this take; nothing is cut while anyone is speaking. The one
  wait that is kept is the one the film is about, from Jo's tap to the card turning.

*Evidence.* Every number on screen was measured in the recording it appears in, or read from the server in it:

- **The one large number**: the seconds from Jo's tap on their phone to the pickup tile on the display turning to
  "Confirmed from their phone", timed by the recorder. The display asks the server every 2.5 s and the evening
  card every 3 s; the tap is timed so that neither asks again for two seconds, so that the camera is on the tile
  when it turns. A take therefore shows a little over two seconds here; in use it is anything from a tenth of a
  second to two and a half.
- **"Rebuilt in N s"**: from the person's first spoken word to the order being confirmed, in the recording as it
  ran, before waits were shortened. The line under it is read from the server at that moment (`get_household`).
- **The arrivals card, "Who can collect Mia".** The product's own helpers card, drawn to scale from the server's
  `find_pickup_helpers` answer: Lee arrives first and is still not eligible.
- **The grocery cap.** The receipt card's bar is drawn from the order result (`cap.before`, `cap.left`), which the
  server computes.
- **The figure, "One yes, on the wire."** The consent round trip and the helper's answer as a sequence diagram,
  with this take's times and the number of MCP calls the recording made; `node scripts/wire.mjs` prints the same
  exchange from a live server. "A person" took several seconds here because the question was read aloud and
  answered aloud.
- **The terminal.** Three lines of a real session of `integrations/strands/relay_agent.py --script` against a local
  server, recorded with asciinema: the command, the server's question as it reached the terminal through the
  protocol, and the answer. (In that session's third turn the model altered the quote token three times and the
  server refused the order each time, friction log entry 10. The rules hold in the server.)
- **The pull request.** `modelcontextprotocol/typescript-sdk#2999` is open, not merged; the film says "open pull request".

**What is on screen.** Apart from the live action, the text cards, the figure and the terminal, everything is a
recording of this repository's simulator page running against its own MCP server on the same machine, driven by a
script that presses, speaks and taps the way a person would, on the display and on the helper's phone. Nothing is
mocked for the film: the cards, the confirmation sheet, the code, the phone page and the "Just in" announcements are
what the page showed. The agent in the recording is a hosted Gemini model (the page's own label
read "gemini-3.5-flash-lite"; the hosted copy runs `gemini-3.5-flash-lite`) following the skill; its answers are its own and are
reproduced below. The live
action is stock footage and shows no one from the story: the family is made up, and the shots are of objects, a
platform and a hand.

**How it was made.** A headless Chromium plays a step list (say this, press that, frame this card). The picture is
the browser's own screencast, placed on a 30 fps timeline by frame timestamps. Cards are sandboxed frames the page
cannot look into; the recorder frames parts of them through each frame's own DevTools context. The live action is
laid under the page afterwards: the recording notes when each shot starts and the moments the picture has to hit,
each clip is graded once with ffmpeg, and the page, which is recorded on black, is added on top with a screen blend.
The reply link in the film is built on the hosted copy's address, so the code on screen points at
relay-home.onrender.com; the phone beside the display opened the same page on the recording machine.

## Every line

| At | Who | Line |
|---|---|---|
| 0:00.7 | Narrator | 4:40. The school just moved Mia's pickup to 5:15. |
| 0:05.2 | Narrator | Alex's train is late. |
| 0:08.8 | Narrator | One change. The whole evening comes apart. |
| 0:12.6 | Narrator | Relay Home rebuilds the evening. And it asks before it acts. |
| 0:19.6 | You | School moved Mia's pickup to 5:15 and Alex's train is late. Keep dinner under $8. |
| 0:26.1 | Narrator | Who may collect Mia. What dinner fits. |
| 0:29.4 | Relay | Jo can pick up Mia by 5:00 PM. |
| 0:31.2 | Relay | For dinner, Sam can make chickpea and tomato soup at 6:10 PM using only pantry items, |
| 0:36.1 | Relay | so it costs nothing. |
| 0:37.5 | Relay | Shall I ask Jo? |
| 0:41.0 | Narrator | Four adults. One deadline. |
| 0:42.9 | Narrator | Not on the school list: never suggested. |
| 0:48.7 | You | Ask Jo |
| 0:51.2 | Relay | Ask Jo to collect Mia at Oakfield School, main gate by 5:15 PM? |
| 0:55.6 | You | Yes. |
| 0:58.1 | Narrator | A private link, for Jo alone. |
| 1:02.0 | Relay | I have asked Jo to pick up Mia, and they are awaiting reply. |
| 1:06.3 | Narrator | Jo's phone. One question. |
| 1:14.7 | Relay | Jo confirmed. |
| 1:16.0 | Relay | The pickup is covered. |
| 1:19.1 | You | Make the pasta and order what we need. |
| 1:21.5 | Narrator | The pasta needs spinach. Relay gets a price. |
| 1:24.5 | Relay | Buy spinach from Corner Market (simulated) for $3.20? |
| 1:27.3 | Relay | Collect at the shop from 5:45 PM. |
| 1:30.1 | You | Yes. |
| 1:35.9 | Relay | Jo has confirmed the pickup for 5:15 PM. |
| 1:38.4 | Relay | I have ordered spinach for $3.20, and |
| 1:41.0 | Relay | Sam will make tomato and chickpea pasta starting at 6:05 PM. |
| 1:44.7 | Narrator | The evening, rebuilt. |
| 1:47.2 | Narrator | What if Jo says no? |
| 1:52.9 | Relay | Call the school or an approved adult; Relay will not suggest anyone else. |
| 1:56.9 | Narrator | It stops. It names no one. |
| 1:59.8 | Narrator | One yes, on the wire. |
| 2:01.8 | Narrator | The server asks. The answer is sealed to the question. |
| 2:06.0 | Narrator | Jo's phone answers the server itself. |
| 2:09.4 | Narrator | The same server, driven by a Strands agent. |
| 2:15.5 | Narrator | Relay Home. It asks before it acts. |

## The conversation in the film

What the page showed, in order and in full. Relay's lines are the model's own; the "Just in" lines are the
display's announcements of what Jo did on their phone.

**You:** School moved Mia's pickup to 5:15 and Alex's train is late. Keep dinner under $8.
**Relay:** Jo can pick up Mia by 5:00 PM. For dinner, Sam can make chickpea and tomato soup at 6:10 PM using only pantry items, so it costs nothing. Shall I ask Jo?
**You:** Ask Jo
**Relay:** I have asked Jo to pick up Mia, and they are awaiting reply. Sam will make chickpea and tomato soup at 6:10 PM using pantry items at no cost.
**Relay:** Jo confirmed. The pickup is covered.
**You:** Make the pasta and order what we need.
**Relay:** Jo has confirmed the pickup for 5:15 PM. I have ordered spinach for $3.20, and Sam will make tomato and chickpea pasta starting at 6:05 PM.
**Relay:** Jo cannot do it and is left out for today. Nobody on the school pickup list can be there by 5:15 PM. Call the school or an approved adult; Relay will not suggest anyone else.

Calls per turn: get_household, find_pickup_helpers, suggest_dinners, draft_evening_plan / ask_helper, confirmation / draft_evening_plan, quote_groceries, place_grocery_order, confirmation.

## What was reused, and what was not

Checked on 10 October 2026, before deciding whether to rebuild the film on a template, and again on 12 October
before adding live action and voices.

Reused in this film:
- **Live action: four clips from Mixkit**, all under the Mixkit Stock Video Free License (commercial use and YouTube allowed, no attribution required; each clip's page was checked on 12 October 2026): [sand falling from an hourglass](https://mixkit.co/free-stock-video/sand-falling-from-an-hourglass-on-a-black-background-28901/), [train arriving to a subway station](https://mixkit.co/free-stock-video/train-arriving-to-a-subway-station-1622/), [domino effect](https://mixkit.co/free-stock-video/domino-effect-5246/), [hands texting on a smartphone](https://mixkit.co/free-stock-video/hands-shown-texting-on-a-smartphone-144/). What we changed: the grade, the framing, the speed, and for the dominoes the direction of time. Clips under Mixkit's "Restricted" licence (personal use only) were left out, which ruled out most footage of people.
- **ffmpeg** (the grade: `eq`, `colorbalance`, `vignette`) and **Pillow** ([python-pillow/Pillow](https://github.com/python-pillow/Pillow), MIT-CMU; the screen blend of the page over the footage). Ours: the time map of each shot and the grain.
- **Kokoro-82M** ([hexgrad/kokoro](https://github.com/hexgrad/kokoro), Apache-2.0): all three voices, through `kokoro-onnx` (`af_heart` narrates, `af_bella` is the person, `bf_emma` is Relay).
- **asciinema** ([asciinema/asciinema](https://github.com/asciinema/asciinema), GPL-3.0): recorded the terminal session. Only its output file is used; the three lines in the film are drawn by the film's own overlay.
- **D3** ([d3/d3](https://github.com/d3/d3), ISC): the stroke transitions of the wire figure. Ours: the data (read from the page and the server during the take), the layout and the styling.
- **The interface on screen** reuses Radix Colors (MIT), Lucide icons (ISC), Open Props easings (MIT) and the Devices.css iPhone frame (MIT); see `THIRD_PARTY_NOTICES.md`.
- **Chromium's own screencast** (`Page.startScreencast` over the DevTools protocol, headless shell from Playwright's browser cache): the picture; frames carry their own timestamps.
- **Our media kit from an earlier project** (wav helpers, mixing with ducking, oscillator instruments and reverb): the bed is one slow chord per bar and two notes on a soft piano-like voice; the clock's tick and the dominoes are synthesised from noise and sine bursts.

Looked at and not used, with the reason:
- [Zulko/moviepy](https://github.com/Zulko/moviepy) (MIT, 15k stars) and [mifi/editly](https://github.com/mifi/editly) (MIT): general editors on top of ffmpeg. Not used because the edit here is a handful of plates under one recording with marks the recording itself sets, and neither has a screen blend; ffmpeg and Pillow, which both build on, were enough.
- [zz41354899/SwiftClip](https://github.com/zz41354899/SwiftClip) (MIT, Remotion templates in Apple light-mode style) and [Curvable/motion](https://github.com/Curvable/motion) (MIT): ready-made keynote looks for text cards. Not used: the film is dark and recording-first, and has a few lines of text on cards.
- [AlexAnsart/demo-studio](https://github.com/AlexAnsart/demo-studio) (MIT): Playwright-driven narrated demos with smart zooms; the nearest open-source equivalent of our recorder. Not used because this film needs a second device, a spoken dialogue through the page's voice mode, and looks inside sandboxed card frames.
- [remotion-dev/remotion](https://github.com/remotion-dev/remotion) (source-available) and [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) (MIT): the frameworks the templates above are built on; a rebuild of the card and caption layer on them remains the route if the cards grow.
