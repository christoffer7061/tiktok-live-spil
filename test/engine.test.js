// Game engine tests with fake events and a fake clock.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { computePoints } from '../src/engine/scoring.js';
import { Round } from '../src/engine/round.js';
import { Engine } from '../src/engine/engine.js';
import { makeEvent } from '../src/events.js';
import math from '../src/games/math.js';
import { Scoreboard } from '../src/engine/scoreboard.js';

const QUESTION = { prompt: '7 × 8', display: '7 × 8 = ?', correctAnswer: '56', wrongAnswers: ['55'] };
const chat = (name, text, receivedAt) => makeEvent('chat', { user: { id: name, name }, text, receivedAt });
const newRound = () => new Round({ number: 1, type: math, question: QUESTION, startedAt: 1000, limitMs: 20000 });

test('point formula: 1000 instant, 750 at half time, 500 at the deadline', () => {
  assert.equal(computePoints(0, 20000), 1000);
  assert.equal(computePoints(10000, 20000), 750);
  assert.equal(computePoints(20000, 20000), 500);
  assert.equal(computePoints(2100, 20000), 948); // round(1000 × (1 − 0.105/2)) = 947.5 → 948
  assert.equal(computePoints(30000, 20000), 500); // clamped
});

test('only the first answer from each viewer counts', () => {
  const r = newRound();
  assert.equal(r.submit(chat('Anna', '55', 2000)), 'wrong');
  assert.equal(r.submit(chat('Anna', '56', 2500)), 'duplicate');
  assert.equal(r.correct.length, 0);
  assert.equal(r.answerCount, 1);

  assert.equal(r.submit(chat('Bo', '56', 3000)), 'correct');
  assert.equal(r.submit(chat('Bo', '56', 3100)), 'duplicate');
  assert.equal(r.correct.length, 1);
});

test('chatter without an answer does not use up the try', () => {
  const r = newRound();
  assert.equal(r.submit(chat('Anna', 'hi everyone 👋', 1500)), 'ignored');
  assert.equal(r.submit(chat('Anna', '56', 2000)), 'correct');
});

test('answers before the start or after the deadline are ignored', () => {
  const r = newRound();
  assert.equal(r.submit(chat('Anna', '56', 999)), 'early');
  assert.equal(r.submit(chat('Bo', '56', 21001)), 'late');
  assert.equal(r.answerCount, 0);
});

test('correct answers are listed in answer-time order with points', () => {
  const r = newRound();
  r.submit(chat('Carla', '56', 4800));
  r.submit(chat('Anna', '56', 3100));
  r.submit(chat('Dev', '12', 2000));
  r.submit(chat('Bo', '56', 3800));
  assert.deepEqual(r.correct.map((c) => c.name), ['Anna', 'Bo', 'Carla']);
  assert.deepEqual(r.correct.map((c) => c.ms), [2100, 2800, 3800]);
  assert.equal(r.correct[0].points, computePoints(2100, 20000));
});

test('the round winner is the fastest correct answer, not the first message', () => {
  const r = newRound();
  r.submit(chat('Wrong', '57', 1100));
  r.submit(chat('Slow', '56', 9000));
  r.submit(chat('Fast', '56', 2000));
  assert.equal(r.winner.name, 'Fast');
  assert.deepEqual(r.summary().top3.map((c) => c.name), ['Fast', 'Slow']);
});

test('a tie on the same millisecond goes to the answer received first', () => {
  const r = newRound();
  r.submit(chat('First', '56', 5000));
  r.submit(chat('Second', '56', 5000));
  r.submit(chat('Third', '56', 5000));
  assert.deepEqual(r.correct.map((c) => c.name), ['First', 'Second', 'Third']);
  assert.equal(r.winner.name, 'First');
});

test('a round where nobody answers correctly has no winner', () => {
  const r = newRound();
  r.submit(chat('Anna', '1', 2000));
  r.submit(chat('Bo', '2', 3000));
  const s = r.summary();
  assert.equal(s.winner, null);
  assert.equal(s.correctCount, 0);
  assert.equal(s.answerCount, 2);
  assert.equal(s.correctAnswer, '56');
});

test('engine runs ready → question → reveal → winner → leaderboard → next round', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let clock = 0;
  const hub = new EventEmitter();
  const fixedMath = { ...math, createQuestion: () => QUESTION };
  const engine = new Engine(hub, { round: { readySeconds: 3, answerSeconds: 20, revealSeconds: 4, winnerSeconds: 6 } }, {
    types: { math: fixedMath },
    now: () => clock,
  });
  let botQuestion = null;
  hub.on('question', (q) => { botQuestion = q; });

  engine.start();
  assert.equal(engine.phase, 'ready');
  assert.equal(engine.roundNumber, 1);

  clock += 3000; t.mock.timers.tick(3000);
  assert.equal(engine.phase, 'question');
  assert.equal(botQuestion.correctAnswer, '56');
  assert.equal(engine.snapshot().correctAnswer, undefined, 'overlay must not see the answer');
  assert.equal(engine.snapshot({ forAdmin: true }).correctAnswer, '56');

  // Answers arrive through the hub like real chat.
  hub.emit('event', chat('Anna', 'answer 56!', clock + 2100));
  hub.emit('event', chat('Bo', '56', clock + 1500));
  hub.emit('event', chat('Carla', '50', clock + 1000));
  const snap = engine.snapshot();
  assert.deepEqual(snap.correct.map((c) => [c.rank, c.name, c.ms]), [[1, 'Bo', 1500], [2, 'Anna', 2100]]);
  assert.equal(snap.answerCount, 3);

  clock += 20000; t.mock.timers.tick(20000);
  assert.equal(engine.phase, 'reveal');
  assert.equal(engine.snapshot().result.winner.name, 'Bo');
  // Answers after the question closed are ignored.
  assert.equal(engine.handleEvent(chat('Late', '56', clock)), null);

  clock += 4000; t.mock.timers.tick(4000);
  assert.equal(engine.phase, 'winner');
  clock += 6000; t.mock.timers.tick(6000);
  assert.equal(engine.phase, 'leaderboard');
  assert.deepEqual(engine.snapshot().leaderboard.map((p) => p.name), ['Bo', 'Anna']);
  // Only one game type here, so there is nothing to vote on.
  clock += 6000; t.mock.timers.tick(6000);
  assert.equal(engine.phase, 'ready');
  assert.equal(engine.roundNumber, 2);
  engine.stop();
});

test('pausing during a question does not count as answer time', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let clock = 0;
  const hub = new EventEmitter();
  const engine = new Engine(hub, { round: { readySeconds: 1, answerSeconds: 20 } }, {
    types: { math: { ...math, createQuestion: () => QUESTION } },
    now: () => clock,
  });
  engine.start();
  clock += 1000; t.mock.timers.tick(1000);
  const start = clock;
  clock += 2000;
  engine.togglePause();
  assert.equal(engine.handleEvent(chat('Paused', '56', clock)), null, 'answers while paused are ignored');
  clock += 60000; t.mock.timers.tick(60000);
  assert.equal(engine.phase, 'question', 'time does not run while paused');
  engine.togglePause();
  hub.emit('event', chat('Anna', '56', clock + 1000));
  assert.equal(engine.snapshot().correct[0].ms, 3000); // 2 s before pause + 1 s after
  assert.ok(clock > start);
  engine.stop();
});

test('streak bonus: +100 per correct answer in a row, max +500, reset by a miss', () => {
  const board = new Scoreboard({ streakBonusPerAnswer: 100, streakBonusMax: 500 });
  const play = (answers) => {
    const r = newRound();
    for (const [name, text] of answers) r.submit(chat(name, text, 1000)); // instant = 1000 points
    return board.applyRound(r);
  };
  const bonuses = [];
  for (let i = 0; i < 8; i++) bonuses.push(play([['Anna', '56']]).get('Anna').bonus);
  assert.deepEqual(bonuses, [0, 100, 200, 300, 400, 500, 500, 500]);
  assert.equal(board.top()[0].points, 8000 + 2500);

  play([['Anna', '1']]); // wrong answer resets
  assert.equal(board.streakOf('Anna'), 0);
  play([['Anna', '56']]);
  play([['Bo', '56']]); // Anna misses this round
  assert.equal(board.streakOf('Anna'), 0);
  assert.equal(board.streakOf('Bo'), 1);
});

test('total leaderboard adds rounds together and sorts by points', () => {
  const board = new Scoreboard();
  const r1 = newRound();
  r1.submit(chat('Anna', '56', 1000));   // 1000
  r1.submit(chat('Bo', '56', 11000));    // 750
  board.applyRound(r1);
  const r2 = newRound();
  r2.submit(chat('Bo', '56', 1000));     // 1000 + 100 streak
  board.applyRound(r2);
  assert.deepEqual(board.top().map((p) => [p.name, p.points]), [['Bo', 1850], ['Anna', 1000]]);
  board.addBonus('Carla', 'Carla', 50);
  assert.equal(board.top().length, 3);
});

function threeTypeEngine(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixed = (key) => ({ ...math, key, name: key, createQuestion: () => QUESTION });
  const hub = new EventEmitter();
  let clock = 0;
  const engine = new Engine(hub, { gameTypes: ['a', 'b', 'c'], round: { readySeconds: 1, answerSeconds: 1, revealSeconds: 1, winnerSeconds: 1, leaderboardSeconds: 1, voteSeconds: 10 } }, {
    types: { a: fixed('a'), b: fixed('b'), c: fixed('c') },
    now: () => clock,
  });
  // Step one second at a time so each phase can schedule the next.
  const advance = (ms) => { for (let i = 0; i < ms; i += 1000) { clock += 1000; t.mock.timers.tick(1000); } };
  return { engine, hub, advance };
}

test('viewers vote for the next game; the current game is not an option', (t) => {
  const { engine, hub, advance } = threeTypeEngine(t);
  engine.start();
  const first = engine.typeKey;
  advance(5000); // ready, question, reveal, winner, leaderboard
  assert.equal(engine.phase, 'vote');
  const options = engine.snapshot().vote.options;
  assert.equal(options.length, 2);
  assert.ok(!options.some((o) => o.key === first));

  hub.emit('event', chat('Anna', '2', 0));
  hub.emit('event', chat('Anna', '1', 0));   // only the first vote counts
  hub.emit('event', chat('Bo', 'vote 2', 0));
  hub.emit('event', chat('Carla', '1', 0));
  hub.emit('event', chat('Dev', 'hello', 0)); // not a vote
  hub.emit('event', chat('Emil', '7', 0));    // no such option
  assert.deepEqual(engine.snapshot().vote.options.map((o) => o.votes), [1, 2]);

  advance(10000);
  assert.equal(engine.phase, 'ready');
  assert.equal(engine.typeKey, options[1].key);
  engine.stop();
});

test('with no votes the next game is random but never the same twice in a row', (t) => {
  const { engine, advance } = threeTypeEngine(t);
  engine.start();
  for (let i = 0; i < 20; i++) {
    const before = engine.typeKey;
    advance(15000); // a whole round including an empty vote
    assert.notEqual(engine.typeKey, before);
  }
  engine.stop();
});
