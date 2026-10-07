# Relay Home tools

| Tool | Changes anything? | What it is for |
|---|---|---|
| `get_household` | no | The day's change of plan, pickup deadline, dinner slot, pantry, remembered preferences, open requests, orders, activity log |
| `find_pickup_helpers` | no | Every known adult with `eligible` and the reasons; `exclude` leaves people out |
| `suggest_dinners` | no | Meals ranked by pantry coverage within `budget`, `maxMinutes`, the diet and the weekly cap |
| `draft_evening_plan` | stores a draft | Pickup and dinner in one plan with a summary and any blockers |
| `ask_helper` | yes, after a yes | Records the request to an eligible helper; status `awaiting reply` |
| `record_helper_reply` | yes | `accepted: true` covers the pickup; `false` leaves that person out of new plans today |
| `withdraw_pickup_request` | yes | Takes back an unanswered request |
| `quote_groceries` | no | Price, slot and a `quoteToken` valid for ten minutes |
| `place_grocery_order` | yes, after a yes | Buys exactly the quoted items; refuses over the weekly cap; same `orderKey` returns the same order |
| `cancel_grocery_order` | yes | Cancels an order and returns the amount to the weekly cap |
| `update_preferences` | yes | Diet and weekly grocery cap that Relay keeps between sessions |
| `confirm_action` | yes | Redeems a confirmation ticket for clients that cannot show the server's own prompt |

`draft_evening_plan`, `find_pickup_helpers`, `suggest_dinners` and `place_grocery_order` carry an MCP Apps view
(`ui://relay-home/...`), so a host that supports MCP Apps shows a card next to your words. Do not repeat the whole
card in speech.
