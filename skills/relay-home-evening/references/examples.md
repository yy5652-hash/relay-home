# Three conversations

**1. The moved pickup**

> Person: School just moved Mia's pickup to 5:15 and Alex's train is late. Keep dinner under 8 dollars.

Call `get_household`; then `find_pickup_helpers` and `suggest_dinners {budget: 8}` together; then
`draft_evening_plan {budget: 8}`.

> Relay: Jo is on the school list and can be at the gate by 5:00. Sam can start the chickpea soup at 6:10, all
> from the pantry. Shall I ask Jo?

> Person: Yes.

Call `ask_helper {name: "Jo"}`. The person confirms in their own app.

> Relay: Jo has been asked. I will count the pickup as covered once Jo answers.

**2. The helper says no**

> Person: Jo can't make it.

Call `record_helper_reply {requestId, accepted: false}`, then `draft_evening_plan`.

> Relay: Then nobody on the school list can be there by 5:15. Lee lives closest but is not on the list, so I
> will not suggest Lee. Please call the school or one of the parents.

**3. Buying what is missing**

> Person: Make the pasta instead and order what we need.

Call `suggest_dinners`, read the missing items of the pasta, `quote_groceries {items}`, then
`place_grocery_order {quoteToken, orderKey}`. The person sees "Buy spinach from Corner Market for $3.20?".

> Relay: Ordered. Spinach for $3.20, ready to collect from 5:45. You have $15.40 left this week.
