// Simulator connection: produces fake TikTok events so the game can be tested
// without being live. Driven from the admin page.
import { makeEvent } from '../events.js';

const BOT_NAMES = [
  'Anna', 'Bo', 'Carla', 'Dev', 'Emil', 'Freya', 'Gus', 'Hana', 'Ivan', 'Jade',
  'Kofi', 'Lena', 'Milo', 'Nora', 'Omar', 'Pia', 'Quinn', 'Rosa', 'Sami', 'Tess',
];
const CHATTER = ['hi!', 'lol', 'lets go', '🔥🔥', 'gg', 'hello from Denmark', 'this is fun', '😂'];
const GIFTS = [
  { name: 'Rose', diamonds: 1 },
  { name: 'Heart', diamonds: 5 },
  { name: 'Galaxy', diamonds: 1000 },
  { name: 'Lion', diamonds: 29999 },
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rand = (min, max) => min + Math.random() * (max - min);

export class Simulator {
  constructor(hub) {
    this.hub = hub;
    this.botsOn = false;
    this.botTimers = new Set();
    this.chatterTimer = null;
    this.stressTimer = null;
    this.botCount = 20;
    this.botAccuracy = 0.7;

    // When a question starts, each bot answers once (if bot mode is on).
    hub.on('question', (q) => this.#botsAnswer(q));
    hub.on('vote', (v) => this.#botsVote(v));
  }

  start() {
    this.hub.setConnectionStatus({ source: 'simulator', state: 'connected', detail: 'Simulator ready' });
  }

  stop() {
    this.setBots(false);
    this.setStress(false);
  }

  chat(name, text) {
    this.hub.push(makeEvent('chat', { user: { id: `sim:${name}`, name }, text }));
  }

  like(name, likeCount = 1) {
    this.hub.push(makeEvent('like', { user: { id: `sim:${name}`, name }, likeCount }));
  }

  gift(name, giftName = 'Rose', count = 1) {
    const g = GIFTS.find((x) => x.name === giftName) ?? { name: giftName, diamonds: 1 };
    this.hub.push(makeEvent('gift', { user: { id: `sim:${name}`, name }, gift: { ...g, count } }));
  }

  follow(name) {
    this.hub.push(makeEvent('follow', { user: { id: `sim:${name}`, name } }));
  }

  // Bot mode: 20 fake viewers that chat, like and answer questions.
  setBots(on) {
    this.botsOn = Boolean(on);
    clearInterval(this.chatterTimer);
    this.chatterTimer = null;
    if (!this.botsOn) {
      for (const t of this.botTimers) clearTimeout(t);
      this.botTimers.clear();
      return;
    }
    this.chatterTimer = setInterval(() => {
      const name = pick(BOT_NAMES.slice(0, this.botCount));
      const r = Math.random();
      if (r < 0.15) this.chat(name, pick(CHATTER));
      else if (r < 0.6) this.like(name, Math.ceil(rand(1, 15)));
      else if (r < 0.62) this.gift(name, pick(GIFTS.slice(0, 2)).name, Math.ceil(rand(1, 5)));
    }, 700);
  }

  // Stress test: 50 chat messages per second from random users.
  setStress(on) {
    clearInterval(this.stressTimer);
    this.stressTimer = null;
    if (!on) return;
    let n = 0;
    this.stressTimer = setInterval(() => {
      for (let i = 0; i < 5; i++) {
        n++;
        this.chat(`stress${n % 500}`, String(Math.floor(Math.random() * 100)));
      }
    }, 100);
  }

  // q = { seconds, correctAnswer, wrongAnswers: [...] } sent by the engine.
  #botsAnswer(q) {
    if (!this.botsOn || !q) return;
    for (const name of BOT_NAMES.slice(0, this.botCount)) {
      const delay = rand(1, q.seconds * 0.9) * 1000;
      const correct = Math.random() < this.botAccuracy;
      const answer = correct ? q.correctAnswer : pick(q.wrongAnswers?.length ? q.wrongAnswers : ['?']);
      const t = setTimeout(() => {
        this.botTimers.delete(t);
        if (this.botsOn) this.chat(name, String(answer));
      }, delay);
      this.botTimers.add(t);
    }
  }

  // v = { count, seconds }: about half the bots vote for a random option.
  #botsVote(v) {
    if (!this.botsOn || !v) return;
    for (const name of BOT_NAMES.slice(0, this.botCount)) {
      if (Math.random() < 0.5) continue;
      const t = setTimeout(() => {
        this.botTimers.delete(t);
        if (this.botsOn) this.chat(name, String(1 + Math.floor(Math.random() * v.count)));
      }, rand(0.5, v.seconds * 0.8) * 1000);
      this.botTimers.add(t);
    }
  }

  status() {
    return { bots: this.botsOn, stress: Boolean(this.stressTimer) };
  }
}
