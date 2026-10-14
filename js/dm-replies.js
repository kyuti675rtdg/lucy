/* Project Lucy — canned creator auto-replies for direct messages.
 * Original copy, written in a warm creator voice. */

export const TYPING_DELAY_MS = 1800;

const BANKS = [
  {
    re: /(buna|coffee|kaffa|brew|espresso|latte|macchiato)/i,
    replies: [
      'Buna time! You should come taste the new roast — it is my favorite thing I have filmed all month.',
      'Haha yes, coffee is life. That episode took three early mornings to shoot!',
      'Glad the coffee videos are landing! I am cupping a new Yirgacheffe lot this weekend.'
    ]
  },
  {
    re: /(collab|partner|work together|feature|sponsor|brand)/i,
    replies: [
      'I would love to collab! Send me your idea and a couple of dates and we will make it happen.',
      'A collab sounds great — what did you have in mind? I am usually free on weekends.',
      'Always open to working with creators I admire. Tell me about your concept!'
    ]
  },
  {
    re: /(price|cost|how much|fee|charge|rate|budget)/i,
    replies: [
      'Good question! I keep a simple rate card — want me to send it over?',
      'Pricing depends on the project, but I am very fair with local brands. Tell me more about what you need!'
    ]
  },
  {
    re: /^(hi|hey|hello|selam|salam|good (morning|afternoon|evening))\b/i,
    replies: [
      'Hey! Thanks for stopping by — how is your day going?',
      'Selam! Great to hear from you.',
      'Hello! What is on your mind today?'
    ]
  },
  {
    re: /(thank|ameseginalehu|shukran|appreciated)/i,
    replies: [
      'You are so welcome — thank you for watching and supporting!',
      'Thank you! Messages like this keep me creating.',
      'Anytime! I really appreciate you being here.'
    ]
  },
  {
    re: /(love|amazing|great|awesome|fire|dope|beautiful|nice video|best)/i,
    replies: [
      'That means everything, thank you! More videos like that are coming this week.',
      'So glad you loved it! Share it with a friend who needs to see it.',
      'Thank you! I put a lot of heart into that one.'
    ]
  }
];

const GENERIC = [
  'Thanks for the message! I will get back to you properly a bit later today.',
  'Appreciate you reaching out! What is new with you?',
  'Haha, love this. Tell me more!',
  'Just saw this — give me a little time and I will reply properly.',
  'Hey! I read every message, even if I am slow to reply. What is up?'
];

export function pickReply(user, text) {
  const t = String(text || '');
  for (const bank of BANKS) {
    if (bank.re.test(t)) {
      return bank.replies[Math.floor(Math.random() * bank.replies.length)];
    }
  }
  const name = user && (user.displayName || user.handle) ? String(user.displayName || user.handle).split(' ')[0] : '';
  const pool = GENERIC.map((g) => (name ? g.replace('!', `, ${name}!`) : g));
  return pool[Math.floor(Math.random() * pool.length)];
}
