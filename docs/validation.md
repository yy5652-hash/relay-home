# Validation record

Verified October 2, 2026 on the local workspace using Node.js 24.19.0, pnpm 11.25.0 and Chrome.

## Automated checks

October 3 follow-up: a failing regression reproduced `Plan dinner under 30 minutes` incorrectly replacing an existing $2 grocery budget with $30. Cooking-time phrases now remain separate from budget phrases. Unit assertions cover `under`, `less than`, `max` and `maximum`, plus explicit budgets before or after the time constraint. The restarted HTTP/MCP workflow also verifies that a time-only follow-up keeps the $2 cap, changes the cooking limit to 20 minutes, leaves tasks unsaved and carries both constraints into the next independent MCP request. All 24 tests pass after the fix. The rebuilt delivery ZIP is checked byte for byte against this tested source; the cleanroom installation checks below describe the October 2 packages.

`node --test`: **24 passed, 0 failed** after adding cross-session MCP draft recovery and competing-draft rejection coverage. The Host-header test uses a raw Node HTTP request because Fetch did not send the intended spoofed Host.

Coverage includes:

- pickup authorization, deadline and candidate ranking;
- explicit rejection of out-of-range or malformed budget and cooking-time requests instead of silent clamping;
- budget/time-sensitive meal selection and no-solution handling;
- standalone named-availability follow-ups, including curly apostrophes, retaining budget/time constraints without mutating the previous draft; the regression failed before the fix, then all 24 tests passed;
- atomic store updates, failed-write rollback and corrupt-file preservation;
- explicit consent, duplicate submission, revision conflicts, expiry with draft-only constraint reset, undo and helper-refusal recovery;
- exact MCP 2025-11-25 initialization over Streamable HTTP;
- official SDK client discovery, tools and invalid arguments;
- token, Origin, Host, CSRF and input-schema rejection;
- complete HTTP workflow and restart recovery, including constraints inherited by an independent MCP client and distinct draft/saved/stale recaps.
- explanations of current, stale, expired and historical plans, with explicit warnings before old trade-offs;
- refusal of competing MCP drafts while a saved local plan remains active.
- after a server restart, HTTP chat follow-ups `Jo is available` / `Jo can’t make it` / `Jo is available` execute real MCP calls, retain the $2 draft budget, alternate between an approved helper and a blocker, and leave tasks unsaved without an active plan.

## Browser checks

- A request under $8 produced an actual MCP trace and a $3.20 proposed shopping list.
- Confirm saved the local plan and retained the awaiting-acknowledgment pickup status.
- Reload retained the plan and conversation.
- Undo restored previous state and added an activity entry.
- Excluding Jo produced an unresolved pickup blocker; no confirm button appeared.
- Mobile viewport check at width 390 reported document width 375, so no horizontal overflow was observed.
- Browser console check returned no warnings/errors at that point.
- Desktop width 1280 also showed no horizontal overflow (document width 1265).
- Budget $2 / 20-minute follow-up changed dinner to zero-addition soup in the browser.
- The early-finish scenario invalidated the old preview and a new plan selected Sam.
- After confirming Sam, recording that Sam could not make pickup restored the saved plan, excluded Sam and automatically proposed Jo through MCP; Jo still needed confirmation. The people card distinguishes Sam's calendar free time from unavailability for this pickup plan, including after a page reload.
- The same synthetic household was reopened after a server restart and page reload. Asking what Relay remembers visibly distinguished Jo's unsaved draft from earlier local changes; `docs/screenshots/desktop-recap.jpg` captures that state.
- `pnpm audit --prod`: no known vulnerabilities found at the time of the check.
- The 155.09-second H.264/AAC video combines a clean synthetic household run with a later memory-query capture from the same local household state. All ten narration clips contain audio. Verification decoded 3,706 video frames through 155.08 seconds, rather than inferring picture coverage from the container/audio duration; a 16-frame contact sheet includes the final scene. The English SRT has 27 two-line cues lasting 4.44–7.28 seconds.
- The final ZIP passed integrity checking; all 28 packaged files matched current project files byte for byte, with no runtime `.data`, MCP token, `node_modules` or `.env*` file inside. The repository ignore rules also exclude those local files.
- An earlier ZIP was extracted into a new temporary directory with no bundled `node_modules` or `.data`. `pnpm install --frozen-lockfile --ignore-scripts` installed all 93 packages from the local content-addressable cache, and that extracted copy passed all 23 tests then present.
- The extracted copy served its UI and state endpoint with HTTP 200 on a separate loopback port. Its official MCP client discovered `household_context`, `preview_evening` and `explain_plan` and called the local server. The temporary server was then stopped.
- A second extracted-copy install used a new isolated pnpm store with the frozen lockfile and ignored lifecycle scripts. pnpm reported `reused 0, downloaded 93, added 93`; all 23 tests then present passed again. This verified dependency retrieval without relying on the machine's existing pnpm content store.
- The current ZIP was extracted again into a separate temporary directory. With the same frozen lockfile and an offline store already populated by the preceding retrieval check, pnpm reused all 93 packages and the extracted copy passed the current 24-test suite, including MCP recovery after restart.
- After the competing-draft guard, a fresh extraction of the delivery ZIP again installed all 93 packages from the previously verified isolated offline store and passed all 24 tests. A separate cleanroom process served the web page and state endpoint with HTTP 200, and `pnpm check:mcp` discovered all three tools over the running Streamable HTTP server. The server was stopped after this smoke check.

Screenshots are observed application states with synthetic data. They are not evidence of a live Alexa integration or actual caregiver communication.

## Not verified

External deployment, live accounts/connectors, real households, assistive-technology user testing, public GitHub reviewer access, public video availability, Devpost registration, submission receipt, official eligibility determination and judging score.
