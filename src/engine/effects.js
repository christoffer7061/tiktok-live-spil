// Likes and gifts. They add fun and a little extra, but can never decide who
// wins a round: the like meter gives EVERYONE double points in a later round,
// and gift bonus points only go on the total leaderboard.
import { EventEmitter } from 'node:events';

export class Effects extends EventEmitter {
  constructor(hub, engine, config = {}) {
    super();
    this.engine = engine;
    this.likesConfig = { meterGoal: 1000, ...config.likes };
    this.giftsConfig = { bonusPointsPerGift: 50, maxBonusPerRound: 200, bigGiftDiamonds: 100, effects: {}, ...config.gifts };
    this.totalLikes = 0;
    this.meter = 0;
    this.giftBonusThisRound = new Map(); // userId -> bonus given in the current round
    this.bonusRound = null;

    hub?.on('event', (e) => {
      if (e.type === 'like') this.onLike(e);
      else if (e.type === 'gift') this.onGift(e);
      else if (e.type === 'follow' || e.type === 'share') this.emit('effect', { kind: e.type, name: e.user.name });
    });
  }

  // Likes arrive in bundles and some can go missing on big streams, so the
  // meter just adds up whatever arrives. Extra likes carry over to the next fill.
  onLike(e) {
    const n = Math.max(1, Number(e.likeCount) || 1);
    this.totalLikes += n;
    const goal = this.likesConfig.meterGoal;
    this.meter += n;
    while (this.meter >= goal) {
      if (!this.engine?.queueDoublePoints()) {
        this.meter = goal; // three double rounds already saved: keep the meter full
        break;
      }
      this.meter -= goal;
      this.emit('effect', { kind: 'likeGoal' });
    }
    this.emit('changed');
  }

  // A gift (combo already finished: see the TikTok connection) gives an effect
  // plus a small bonus on the total leaderboard, capped per viewer per round.
  onGift(e) {
    const { bonusPointsPerGift, maxBonusPerRound, bigGiftDiamonds, effects } = this.giftsConfig;
    const round = this.engine?.roundNumber ?? 0;
    if (round !== this.bonusRound) {
      this.bonusRound = round;
      this.giftBonusThisRound.clear();
    }
    const given = this.giftBonusThisRound.get(e.user.id) ?? 0;
    const bonus = Math.max(0, Math.min(bonusPointsPerGift * e.gift.count, maxBonusPerRound - given));
    if (bonus > 0) {
      this.giftBonusThisRound.set(e.user.id, given + bonus);
      this.engine?.scoreboard.addBonus(e.user.id, e.user.name, bonus);
    }
    const diamonds = e.gift.diamonds * e.gift.count;
    const big = diamonds >= bigGiftDiamonds;
    this.emit('effect', {
      kind: 'gift',
      effect: big ? 'fireworks' : effects[e.gift.name] ?? effects.default ?? 'sparkle',
      name: e.user.name,
      gift: e.gift.name,
      count: e.gift.count,
      bonus,
      big,
    });
    this.emit('changed');
    return bonus;
  }

  snapshot() {
    return {
      total: this.totalLikes,
      meter: this.meter,
      goal: this.likesConfig.meterGoal,
      pendingDoubles: this.engine?.pendingDoubles ?? 0,
    };
  }
}
