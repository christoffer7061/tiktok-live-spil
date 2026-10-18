// The game engine. Runs the round phases, collects answers through Round,
// and tells the pages what to show. Knows nothing about TikTok: it only
// reads normalized events from the hub.
//
// Phases: idle → ready (3 s, game name) → question (answers count)
//         → reveal (correct answer) → winner (round winner + top 3) → ready …
import { EventEmitter } from 'node:events';
import { Round } from './round.js';
import { now as defaultNow } from '../events.js';
import { GAME_TYPES } from '../games/index.js';

const VISIBLE_ROWS = 10;

export class Engine extends EventEmitter {
  constructor(hub, config, { types = GAME_TYPES, now = defaultNow } = {}) {
    super();
    this.hub = hub;
    this.config = config;
    this.types = types;
    this.now = now;

    this.phase = 'idle';
    this.paused = false;
    this.roundNumber = 0;
    this.round = null;
    this.typeKey = null;
    this.lastSummary = null;

    this.timer = null;
    this.phaseStartedAt = 0;
    this.phaseDuration = 0;
    this.remainingWhenPaused = 0;
    this.pausedAt = 0;

    hub?.on('event', (e) => this.handleEvent(e));
    hub?.on('admin', (msg) => this.handleAdmin(msg));
  }

  // --- Admin controls ---------------------------------------------------------
  handleAdmin({ cmd }) {
    if (cmd === 'game.start') this.start();
    else if (cmd === 'game.pause') this.togglePause();
    else if (cmd === 'game.skip') this.skip();
    else if (cmd === 'game.reset') this.reset();
  }

  start() {
    if (this.paused) return this.togglePause();
    if (this.phase === 'idle') this.#enterReady();
  }

  togglePause() {
    if (this.phase === 'idle') return;
    if (!this.paused) {
      this.paused = true;
      this.pausedAt = this.now();
      this.remainingWhenPaused = Math.max(0, this.phaseStartedAt + this.phaseDuration - this.pausedAt);
      clearTimeout(this.timer);
    } else {
      const pausedFor = this.now() - this.pausedAt;
      this.paused = false;
      // Shift the clock so paused time does not count as answer time.
      this.phaseStartedAt += pausedFor;
      if (this.round && this.phase === 'question') this.round.startedAt += pausedFor;
      this.#schedule(this.remainingWhenPaused, this.#nextStep());
    }
    this.#changed();
  }

  // Skip the current round without awarding anything and go to the next one.
  skip() {
    if (this.phase === 'idle') return;
    this.paused = false;
    this.round = null;
    this.#enterReady();
  }

  // Stop the game and start over from round 1.
  reset() {
    clearTimeout(this.timer);
    this.phase = 'idle';
    this.paused = false;
    this.roundNumber = 0;
    this.round = null;
    this.typeKey = null;
    this.lastSummary = null;
    this.#changed();
  }

  // --- Chat -> answers ----------------------------------------------------------
  handleEvent(e) {
    if (e.type !== 'chat' || this.phase !== 'question' || this.paused || !this.round) return null;
    const result = this.round.submit(e);
    if (result === 'correct' || result === 'wrong') this.#changed();
    return result;
  }

  // --- Phases -------------------------------------------------------------------
  #enterReady() {
    this.roundNumber++;
    this.typeKey = this.pickNextType();
    this.#setPhase('ready', this.#sec('readySeconds', 3));
  }

  #enterQuestion() {
    const type = this.types[this.typeKey];
    const question = type.createQuestion(this.difficulty());
    const limitMs = this.#sec('answerSeconds', 20);
    this.round = new Round({
      number: this.roundNumber,
      type,
      question,
      startedAt: this.now(),
      limitMs,
      maxPoints: this.config.scoring?.maxPoints ?? 1000,
    });
    this.#setPhase('question', limitMs);
    // Lets the simulator's bots answer.
    this.hub?.emit('question', { seconds: limitMs / 1000, correctAnswer: question.correctAnswer, wrongAnswers: question.wrongAnswers });
  }

  // Ends the answer window. Public so tests can end a round without waiting.
  endQuestion() {
    if (this.phase !== 'question') return null;
    this.lastSummary = this.round.summary();
    this.#setPhase('reveal', this.#sec('revealSeconds', 4));
    return this.lastSummary;
  }

  #enterWinner() {
    this.#setPhase('winner', this.#sec('winnerSeconds', 6));
  }

  #nextStep() {
    return {
      ready: () => this.#enterQuestion(),
      question: () => this.endQuestion(),
      reveal: () => this.#enterWinner(),
      winner: () => this.#enterReady(),
    }[this.phase];
  }

  #setPhase(phase, durationMs) {
    clearTimeout(this.timer);
    this.phase = phase;
    this.phaseStartedAt = this.now();
    this.phaseDuration = durationMs;
    this.#schedule(durationMs, this.#nextStep());
    this.#changed();
  }

  #schedule(ms, fn) {
    clearTimeout(this.timer);
    if (fn && !this.paused) this.timer = setTimeout(fn, ms);
  }

  #sec(key, fallback) {
    return (this.config.round?.[key] ?? fallback) * 1000;
  }

  #changed() {
    this.emit('changed');
  }

  // --- Choices ------------------------------------------------------------------
  activeTypes() {
    const wanted = this.config.gameTypes ?? Object.keys(this.types);
    const keys = wanted.filter((k) => this.types[k]);
    return keys.length ? keys : Object.keys(this.types);
  }

  // Milestone 2: cycle through the active types. (Viewer voting comes later.)
  pickNextType() {
    const keys = this.activeTypes();
    const i = keys.indexOf(this.typeKey);
    return keys[(i + 1) % keys.length];
  }

  // 'easy' | 'medium' | 'hard', or 'rising' = gets harder as the stream goes on.
  difficulty() {
    const d = this.config.difficulty ?? 'rising';
    if (d !== 'rising') return d;
    if (this.roundNumber <= 3) return 'easy';
    if (this.roundNumber <= 8) return 'medium';
    return 'hard';
  }

  stop() {
    clearTimeout(this.timer);
  }

  // --- What the pages see -------------------------------------------------------
  // forAdmin = true includes the correct answer while the question is open.
  snapshot({ forAdmin = false } = {}) {
    const type = this.types[this.typeKey];
    const remaining = this.paused
      ? this.remainingWhenPaused
      : Math.max(0, this.phaseStartedAt + this.phaseDuration - this.now());
    const state = {
      phase: this.phase,
      paused: this.paused,
      roundNumber: this.roundNumber,
      phaseDuration: this.phaseDuration,
      phaseRemaining: Math.round(remaining),
      game: type ? { key: type.key, name: type.name, instructions: type.instructions } : null,
      difficulty: this.phase === 'idle' ? null : this.difficulty(),
    };
    if (this.round && ['question', 'reveal', 'winner'].includes(this.phase)) {
      const q = this.round.question;
      state.question = { display: q.display, prompt: q.prompt, options: q.options ?? null };
      state.correct = this.round.correct.slice(0, VISIBLE_ROWS).map((c, i) => ({ rank: i + 1, name: c.name, ms: Math.round(c.ms), points: c.points }));
      state.correctCount = this.round.correct.length;
      state.answerCount = this.round.answerCount;
      if (forAdmin) state.correctAnswer = q.correctAnswer;
    }
    if (this.lastSummary && ['reveal', 'winner'].includes(this.phase)) {
      const s = this.lastSummary;
      state.result = {
        correctAnswer: s.correctAnswer,
        winner: s.winner && { name: s.winner.name, ms: Math.round(s.winner.ms), points: s.winner.points },
        top3: s.top3.map((c, i) => ({ rank: i + 1, name: c.name, ms: Math.round(c.ms), points: c.points })),
        correctCount: s.correctCount,
        answerCount: s.answerCount,
      };
    }
    return state;
  }
}
