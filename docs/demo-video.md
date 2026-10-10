# Demo video

Length 1:52, 1920x1080, English, burned-in captions, with a matching `.srt`. It shows Relay Home 2.1: the kitchen
display, and Jo answering from their own phone.

**The brief it was cut to.** One subject per shot (the display, the phone, or a line of text on black); no counters,
badges or stamps; one short caption per sentence; a soft synthesised bed that stops for the moment that matters.
The arc: a quiet open (the notice, one line), the plan, the ask, then the one moment the film is built around, at
1:04, when Jo taps yes on their phone and the display, on its own, says so, with a single note. After it: the exact
total, the no, three numbers, the line.

**What is on screen.** Behind the text cards, everything is a recording of this repository's simulator page running
against its own MCP server on the same machine, driven by a script that clicks, types and taps the way a person
would, on the display and on the helper's phone. Nothing is mocked for the film: the cards, the confirmation sheet,
the code, the phone page, the "Just in" announcements and the list of MCP calls are what the page showed. The agent
in the recording is Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`, free tier) following the skill; its answers are
its own and are reproduced below. The captions, the pointer and the text cards are drawn over the page for the film.

**How it was made.** A headless Chromium plays a step list (say this sentence, click this, frame that). The picture
is the browser's own screencast, placed on a 30 fps timeline by frame timestamps. The narration is a synthetic voice
(Kokoro, Apache-2.0). The bed is one slow chord per bar and one plucked note, synthesised by our own script; no
existing recording, sample or melody is used. The reply link in the film is built on the hosted copy's address, so
the code on screen points at relay-home.onrender.com; the phone beside the display opened the same page on the
recording machine.

## Narration

| At | Caption |
|---|---|
| 0:01.0 | 4:40. The school just moved Mia's pickup to 5:15. |
| 0:05.2 | Alex's train is late. |
| 0:07.6 | One change. The whole evening comes apart. |
| 0:11.9 | Relay Home rebuilds the evening. And it asks before it acts. |
| 0:17.8 | Say what changed. |
| 0:19.8 | Who can collect Mia. What dinner fits. One plan. |
| 0:25.5 | Every step: a real MCP call. |
| 0:32.7 | Not on the school list: never suggested. |
| 0:40.7 | Nothing happens without your yes. |
| 0:48.4 | Asked. Not covered until Jo answers. |
| 0:52.5 | A private link, for this request only. |
| 0:59.8 | Jo's phone. One question. |
| 1:05.4 | Confirmed, from Jo's own phone. |
| 1:11.2 | The exact total. Nothing more. |
| 1:17.0 | Once. Inside the weekly cap. |
| 1:20.5 | Jo cannot make it. |
| 1:24.6 | It stops. It names no one. |
| 1:31.7 | A self-hosted MCP server. An Agent Skill. MCP Apps cards. |
| 1:41.2 | The same server, from a Strands agent. |
| 1:47.3 | Relay Home. It asks before it acts. |

## The conversation in the film

What the page showed, in order. Relay's lines are the model's own; the two "Just in" lines are the display's
announcements of what Jo did on their phone.

**You:** School moved Mia's pickup to 5:15 and Alex's train is late. Keep dinner under $8.
**Relay:** Jo can collect Mia by 5:00 PM. For dinner, Sam can make chickpea and tomato soup at 6:10 PM using only the pantry items at no extra cost. Shall I ask Jo to pick up Mia?
**You:** Ask Jo
**Relay:** Jo has been asked to collect Mia and we are waiting for their reply.
**Relay:** Jo confirmed. The pickup is covered.
**You:** Make the pasta and order what we need.
**Relay:** Jo confirmed the pickup. I have ordered the spinach for $3.20 from Corner Market, ready for collection from 5:45 PM, and Sam will make the tomato and chickpea pasta at 6:05 PM.
**Relay:** Jo cannot do it and is left out for today. Nobody on the school pickup list can be there by 5:15 PM. Call the school or an approved adult; Relay will not suggest anyone else.

Calls per turn: get_household, find_pickup_helpers, suggest_dinners, draft_evening_plan / ask_helper, confirmation / get_household, find_pickup_helpers, suggest_dinners, draft_evening_plan, quote_groceries, place_grocery_order, confirmation.

## What was reused, and what was not

Checked on 10 October 2026, before deciding whether to rebuild the film on a template.

Reused in this film:
- **Kokoro-82M** ([hexgrad/kokoro](https://github.com/hexgrad/kokoro), Apache-2.0, 9.2k stars): the narration voice, through `kokoro-onnx`; unchanged.
- **Chromium's own screencast** (`Page.startScreencast` over the DevTools protocol, headless shell from Playwright's browser cache): the picture; frames carry their own timestamps, which is what keeps captions and the accent note on the clock.
- **Our media kit from an earlier project** (`nw_media.py`, `build_music.py`: wav helpers, mixing with ducking, oscillator instruments and reverb): the quiet bed is one slow chord per bar and one plucked note built from those instruments; the EDM arrangement the kit ships was not used.
- The recorder, the in-page overlay and the assembly script are the ones written for the 2.0 film, cut down (the counters, badges, stamps and gauge were removed for this edition).

Looked at and not used, with the reason:
- [zz41354899/SwiftClip](https://github.com/zz41354899/SwiftClip) (MIT, 32 Remotion templates in Apple light-mode style: Product Launch, Brand Reveal, Minimal Title, Metric Dashboard, End Screen) and [Curvable/motion](https://github.com/Curvable/motion) (MIT, 14 launch-video scenes): the closest thing to a ready-made keynote look for the three text cards. Not used this time because the film is dark and screen-recording-first, so each template would need restyling, and the cards are three lines of text; worth adopting for the next edition if the cards grow.
- [yuxuant2025/vision-video-in-a-weekend](https://github.com/yuxuant2025/vision-video-in-a-weekend) (MIT, 248 stars): a recipe rather than a template; its "timing spine" (one table that places every voice line and every scene) is the same idea as our step list, and its script framework is for vision videos with talking heads, which this is not.
- [AlexAnsart/demo-studio](https://github.com/AlexAnsart/demo-studio) (MIT): Playwright-driven narrated demos with smart zooms, ElevenLabs voice and Whisper alignment; the nearest open-source equivalent of our recorder. Not used because this film needs taps inside the helper's phone frame and the display's own announcements, which the skill does not drive, and because ElevenLabs is a paid service.
- [remotion-dev/remotion](https://github.com/remotion-dev/remotion) (63k stars, source-available; free for individuals) and [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) (MIT, 19k): the frameworks the templates above are built on. A rebuild of the card and caption layer on Remotion with SwiftClip's Minimal Title and Brand Reveal is the recommended route for a fourth edition; the screencast would stay as it is, placed under it as a video layer.
- [reactvideoeditor/remotion-templates](https://github.com/reactvideoeditor/remotion-templates) (81 templates): no licence file, so not reusable.
