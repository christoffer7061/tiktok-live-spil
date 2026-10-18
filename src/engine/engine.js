// The game engine. Runs the round phases, collects answers through Round,
// keeps the total leaderboard, and tells the pages what to show. Knows nothing
// about TikTok: it only reads normalized events from the hub.
//
// Phases: idle → ready (3 s, game name) → question (answers count)
//         → reveal (correct answer) → winner (round winner + top 3)
//         → leaderboard (total points) → vote (viewers pick next game) → ready …
import { EventEmitter } from 'node:events';
import { Round } from './round.js';
import { Scoreboard } from './scoreboard.js';
import { now as defaultNow } from '../events.js';
import { GAME_TYPES } from '../games/index.js';
import { cleanText } from '../games/answer-text.js';

const VISIBLE_ROWS = 10;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class Engine extends EventEmitter {
  constructor(hub, config, { types = GAME_TYPES, now = defaultNow } = {}) {
    super();
    this.hub = hub;
    this.config = config;
    this.types = types;
    this.now = now;
    this.scoreboard = new Scoreboard(config.scoring);

    this.phase = 'idle';
    this.paused = false;
    this.roundNumber = 0;
    this.round = null;
    this.typeKey = null;
    this.nextTypeKey = null;
    this.lastSummary = null;
    this.vote = null;
    this.multiplier = 1;       // 2 during a double-points round
    this.nextMultiplier = 1;

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
    else if (cmd === 'game.stop') this.stopGame();
    else if (cmd === 'game.resetPoints') this.resetPoints();
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

  // Stop the game and go back to the waiting screen. Points are kept.
  stopGame() {
    clearTimeout(this.timer);
    this.phase = 'idle';
    this.paused = false;
    this.round = null;
    this.vote = null;
    this.lastSummary = null;
    this.#changed();
  }

  // Clear the total leaderboard and start counting rounds from 1 again.
  resetPoints() {
    this.scoreboard.clear();
    this.roundNumber = this.phase === 'idle' ? 0 : this.roundNumber;
    this.#changed();
  }

  // Next round gets double points (used by the like meter).
  queueDoublePoints() {
    this.nextMultiplier = 2;
    this.#changed();
  }

  // --- Chat -> answers and votes --------------------------------------------------
  handleEvent(e) {
    if (e.type !== 'chat' || this.paused) return null;
    if (this.phase === 'vote') return this.#castVote(e);
    if (this.phase !== 'question' || !this.round) return null;
    const result = this.round.submit(e);
    if (result === 'correct' || result === 'wrong') this.#changed();
    return result;
  }

  // "1", "2", "vote 3" … First vote per viewer counts, like answers.
  #castVote(e) {
    const m = cleanText(e.text).match(/^(?:vote\s*)?([1-9])$/);
    if (!m) return null;
    const index = Number(m[1]) - 1;
    if (index >= this.vote.options.length || this.vote.voters.has(e.user.id)) return null;
    this.vote.voters.set(e.user.id, index);
    this.vote.options[index].votes++;
    this.#changed();
    return 'vote';
  }

  // --- Phases -------------------------------------------------------------------
  #enterReady() {
    this.roundNumber++;
    this.typeKey = this.nextTypeKey ?? this.randomType(this.typeKey);
    this.nextTypeKey = null;
    this.multiplier = this.nextMultiplier;
    this.nextMultiplier = 1;
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

  // Ends the answer window and adds the round to the leaderboard.
  // Public so tests can end a round without waiting.
  endQuestion() {
    if (this.phase !== 'question') return null;
    const awarded = this.scoreboard.applyRound(this.round, this.multiplier);
    const summary = this.round.summary();
    const withAward = (c) => c && { ...c, total: awarded.get(c.userId)?.points ?? c.points, bonus: awarded.get(c.userId)?.bonus ?? 0, streak: awarded.get(c.userId)?.streak ?? 0 };
    summary.winner = withAward(summary.winner);
    summary.top3 = summary.top3.map(withAward);
    summary.answerLabel = this.round.question.answerLabel ?? summary.correctAnswer;
    summary.revealDisplay = this.round.question.revealDisplay ?? null;
    this.lastSummary = summary;
    this.#setPhase('reveal', this.#sec('revealSeconds', 4));
    return summary;
  }

  #enterWinner() {
    this.#setPhase('winner', this.#sec('winnerSeconds', 6));
  }

  #enterLeaderboard() {
    this.#setPhase('leaderboard', this.#sec('leaderboardSeconds', 6));
  }

  // Viewers vote for the next game type, among the types not just played.
  #enterVote() {
    let keys = this.activeTypes().filter((k) => k !== this.typeKey);
    if (keys.length <= 1) {
      this.nextTypeKey = keys[0] ?? this.typeKey;
      return this.#enterReady();
    }
    if (keys.length > 3) keys = [...keys].sort(() => Math.random() - 0.5).slice(0, 3);
    this.vote = { options: keys.map((key) => ({ key, name: this.types[key].name, votes: 0 })), voters: new Map() };
    const ms = this.#sec('voteSeconds', 10);
    this.#setPhase('vote', ms);
    this.hub?.emit('vote', { count: keys.length, seconds: ms / 1000 });
  }

  // Most votes wins. A tie, or no votes at all, is decided at random.
  endVote() {
    if (this.phase !== 'vote') return null;
    const best = Math.max(...this.vote.options.map((o) => o.votes));
    this.nextTypeKey = pick(this.vote.options.filter((o) => o.votes === best)).key;
    this.vote = null;
    this.#enterReady();
    return this.typeKey;
  }

  #nextStep() {
    return {
      ready: () => this.#enterQuestion(),
      question: () => this.endQuestion(),
      reveal: () => this.#enterWinner(),
      winner: () => this.#enterLeaderboard(),
      leaderboard: () => this.#enterVote(),
      vote: () => this.endVote(),
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

  // Random type, but never the same one twice in a row.
  randomType(exclude) {
    const keys = this.activeTypes();
    const others = keys.filter((k) => k !== exclude);
    return pick(others.length ? others : keys);
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
      multiplier: this.multiplier,
      nextMultiplier: this.nextMultiplier,
      players: this.scoreboard.size,
    };
    if (this.round && ['question', 'reveal', 'winner'].includes(this.phase)) {
      const q = this.round.question;
      state.question = { display: q.display, options: q.options ?? null };
      state.correct = this.round.correct.slice(0, VISIBLE_ROWS).map((c, i) => ({
        rank: i + 1,
        name: c.name,
        ms: Math.round(c.ms),
        points: c.points,
        // Streak this answer gives (shown as 🔥 from 2 in a row).
        streak: this.phase === 'question' ? this.scoreboard.streakOf(c.userId) + 1 : this.scoreboard.streakOf(c.userId),
      }));
      state.correctCount = this.round.correct.length;
      state.answerCount = this.round.answerCount;
      if (forAdmin) state.correctAnswer = q.answerLabel ?? q.correctAnswer;
    }
    if (this.lastSummary && ['reveal', 'winner'].includes(this.phase)) {
      const s = this.lastSummary;
      const row = (c, i) => ({ rank: i + 1, name: c.name, ms: Math.round(c.ms), points: c.total, bonus: c.bonus, streak: c.streak });
      state.result = {
        correctAnswer: s.correctAnswer,
        answerLabel: s.answerLabel,
        revealDisplay: s.revealDisplay,
        winner: s.winner && row(s.winner, 0),
        top3: s.top3.map(row),
        correctCount: s.correctCount,
        answerCount: s.answerCount,
      };
    }
    if (['leaderboard', 'vote', 'idle'].includes(this.phase) || forAdmin) {
      state.leaderboard = this.scoreboard.top(10);
    }
    if (this.vote) {
      state.vote = {
        options: this.vote.options.map((o, i) => ({ number: i + 1, key: o.key, name: o.name, votes: o.votes })),
        total: this.vote.voters.size,
      };
    }
    return state;
  }
}
