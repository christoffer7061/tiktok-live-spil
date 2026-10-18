// Helpers for reading answers out of chat messages in a forgiving way:
// ignores case, spaces, punctuation and emojis around the answer.

// Lowercase, strip emojis/punctuation, collapse spaces. Keeps letters (any
// language), digits and minus signs.
export function cleanText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words people put in front of an answer: "answer 56", "svar B", "it's true".
const FILLER = new Set(['answer', 'answers', 'ans', 'svar', 'its', 'it', 's', 'is', 'my', 'the', 'i', 'say', 'think', 'guess', 'final']);

export function stripFiller(text) {
  return cleanText(text).split(' ').filter((w) => w && !FILLER.has(w)).join(' ');
}

// Finds the number in a message: "56", " 56!", "answer 56", "=56".
// If several numbers are written ("7x8=56") the last one counts.
// Returns null when the message has no number, so normal chat is ignored.
export function extractNumber(text) {
  const matches = String(text ?? '').normalize('NFKC').match(/-?\d+/g);
  if (!matches) return null;
  return Number(matches[matches.length - 1]);
}
