// The synthetic household every new session starts from. Nothing here is a real person, school or shop.
// Times are minutes after midnight on the day of the story.

export const at = (hours, minutes = 0) => hours * 60 + minutes;

export function clock(minutes) {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

export const money = amount => `$${amount.toFixed(2)}`;

export function newHousehold() {
  return {
    revision: 1,
    date: '2026-10-22',
    now: at(16, 40),
    child: 'Mia',
    childPronouns: 'she/her',
    event: {
      source: 'Oakfield School notice',
      received: at(16, 40),
      text: 'Football practice moved indoors and ends early. Mia needs pickup at 5:15 PM instead of 6:00 PM.'
    },
    pickup: { deadline: at(17, 15), location: 'Oakfield School, main gate', original: 'Alex' },
    // "approved" is the school's pickup list, "free" comes from each person's calendar, "travel" from their usual start point.
    people: [
      { name: 'Alex', role: 'Parent', pronouns: 'he/him', approved: true, free: at(18, 10), travel: 15, note: 'Train delayed, arrives 6:10 PM' },
      { name: 'Sam', role: 'Parent', pronouns: 'she/her', approved: true, free: at(17, 0), travel: 20, note: 'Client call until 5:00 PM' },
      { name: 'Jo', role: 'Neighbour', pronouns: 'they/them', approved: true, free: at(16, 45), travel: 15, note: 'On the school pickup list since September' },
      { name: 'Lee', role: 'Neighbour', pronouns: 'he/him', approved: false, free: at(16, 40), travel: 10, note: 'Not on the school pickup list' }
    ],
    dinner: { time: at(18, 30), cook: 'Sam' },
    pantry: { pasta: 1, tomatoes: 2, chickpeas: 1, rice: 1, onion: 2 },
    meals: [
      { id: 'pasta', name: 'Tomato and chickpea pasta', minutes: 25, vegetarian: true, needs: ['pasta', 'tomatoes', 'chickpeas', 'spinach'] },
      { id: 'bowls', name: 'Garden rice bowls', minutes: 30, vegetarian: true, needs: ['rice', 'broccoli', 'tofu'] },
      { id: 'soup', name: 'Chickpea and tomato soup', minutes: 20, vegetarian: true, needs: ['chickpeas', 'tomatoes', 'onion'] },
      { id: 'chicken', name: 'Lemon chicken with rice', minutes: 35, vegetarian: false, needs: ['rice', 'chicken', 'lemon'] }
    ],
    // What the household told Relay to keep. This is the state that survives sessions.
    memory: { vegetarian: true, weeklyGroceryCap: 40, spentThisWeek: 21.4, declined: [] },
    requests: [],   // pickup requests Relay has recorded, newest last
    orders: [],     // grocery orders, newest last
    plan: null,     // the latest evening plan Relay drew up
    log: []         // what happened, in order, for the recap and the audit view
  };
}

// The grocer is a separate simulated service with its own prices and delivery slots.
export const GROCER = {
  name: 'Corner Market (simulated)',
  prices: { spinach: 3.2, broccoli: 2.8, tofu: 3.9, chicken: 7.5, lemon: 0.9, pasta: 1.6, tomatoes: 2.4, chickpeas: 1.3, rice: 2.1, onion: 0.8 },
  slots: [
    { id: 'pickup-1745', label: 'Collect at the shop from 5:45 PM', ready: at(17, 45), fee: 0 },
    { id: 'delivery-1800', label: 'Delivered by 6:00 PM', ready: at(18, 0), fee: 2.99 }
  ]
};
