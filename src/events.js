// The shared event format. Every connection (TikTok or simulator) turns its
// raw data into these objects, so the game engine never knows where they came from.
//
// { type: 'chat' | 'like' | 'gift' | 'member' | 'follow' | 'share',
//   user: { id, name, avatar },
//   text?, likeCount?, gift?: { name, diamonds, count },
//   receivedAt }   <- high-resolution timestamp (ms) taken the moment we got it

import { performance } from 'node:perf_hooks';

export const EVENT_TYPES = ['chat', 'like', 'gift', 'member', 'follow', 'share'];

// Monotonic clock in milliseconds. Not affected by system clock changes,
// which matters when we measure answer times.
export const now = () => performance.now();

export function makeEvent(type, { user, text, likeCount, gift, receivedAt } = {}) {
  if (!EVENT_TYPES.includes(type)) throw new Error(`Unknown event type: ${type}`);
  const event = {
    type,
    user: {
      id: String(user?.id ?? user?.name ?? 'unknown'),
      name: String(user?.name ?? user?.id ?? 'unknown'),
      avatar: user?.avatar ?? null,
    },
    receivedAt: receivedAt ?? now(),
  };
  if (type === 'chat') event.text = String(text ?? '');
  if (type === 'like') event.likeCount = Math.max(1, Number(likeCount) || 1);
  if (type === 'gift') {
    event.gift = {
      name: String(gift?.name ?? 'Gift'),
      diamonds: Number(gift?.diamonds) || 0,
      count: Math.max(1, Number(gift?.count) || 1),
    };
  }
  return event;
}
