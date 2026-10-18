// Like meter and gift bonus tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Effects } from '../src/engine/effects.js';
import { Engine } from '../src/engine/engine.js';
import { Round } from '../src/engine/round.js';
import { makeEvent } from '../src/events.js';
import math from '../src/games/math.js';

const like = (name, likeCount) => makeEvent('like', { user: { id: name, name }, likeCount });
const gift = (name, giftName, count = 1, diamonds = 1) => makeEvent('gift', { user: { id: name, name }, gift: { name: giftName, count, diamonds } });

function setup(config = {}) {
  const hub = new EventEmitter();
  const engine = new Engine(hub, { round: {}, ...config });
  const effects = new Effects(hub, engine, { likes: { meterGoal: 1000 }, gifts: { bonusPointsPerGift: 50, maxBonusPerRound: 200, bigGiftDiamonds: 100, effects: { Rose: 'hearts', default: 'sparkle' } } });
  const fx = [];
  effects.on('effect', (e) => fx.push(e));
  return { hub, engine, effects, fx };
}

test('likes in bundles fill the meter and unlock a double-points round', () => {
  const { hub, engine, effects, fx } = setup();
  hub.emit('event', like('Anna', 400));
  hub.emit('event', like('Bo', 450));
  assert.equal(effects.snapshot().meter, 850);
  assert.equal(engine.nextMultiplier, 1);
  hub.emit('event', like('Carla', 300)); // 1150: full, 150 carries over
  assert.equal(effects.snapshot().meter, 150);
  assert.equal(effects.snapshot().total, 1150);
  assert.equal(engine.pendingDoubles, 1);
  assert.equal(engine.nextMultiplier, 2);
  assert.deepEqual(fx.map((e) => e.kind), ['likeGoal']);
});

test('at most 3 double-points rounds can be saved up', () => {
  const { hub, engine, effects } = setup();
  hub.emit('event', like('Anna', 10000));
  assert.equal(engine.pendingDoubles, 3);
  assert.equal(effects.snapshot().meter, 1000, 'meter stays full until a double round is used');
});

test('a double-points round doubles round points but not the streak bonus', () => {
  const { engine } = setup();
  const round = new Round({ number: 1, type: math, question: { correctAnswer: '56' }, startedAt: 0, limitMs: 20000 });
  round.submit(makeEvent('chat', { user: { id: 'a', name: 'Anna' }, text: '56', receivedAt: 0 }));
  assert.equal(engine.scoreboard.applyRound(round, 2).get('a').points, 2000);
});

test('gifts give +50 each, capped at +200 per viewer per round', () => {
  const { hub, engine, fx } = setup();
  engine.roundNumber = 1;
  hub.emit('event', gift('Anna', 'Rose'));
  hub.emit('event', gift('Anna', 'Rose', 2));
  hub.emit('event', gift('Anna', 'Rose', 5));  // only 50 left of the cap
  hub.emit('event', gift('Anna', 'Rose'));     // cap reached
  assert.deepEqual(fx.map((e) => e.bonus), [50, 100, 50, 0]);
  assert.equal(engine.scoreboard.top()[0].points, 200);

  engine.roundNumber = 2; // new round, new cap
  hub.emit('event', gift('Anna', 'Rose'));
  assert.equal(engine.scoreboard.top()[0].points, 250);
});

test('gifts pick an effect from the table; big gifts get fireworks', () => {
  const { hub, fx } = setup();
  hub.emit('event', gift('Anna', 'Rose'));
  hub.emit('event', gift('Bo', 'Unknown'));
  hub.emit('event', gift('Carla', 'Galaxy', 1, 1000));
  assert.deepEqual(fx.map((e) => [e.effect, e.big]), [['hearts', false], ['sparkle', false], ['fireworks', true]]);
});

test('gifts never change who wins a round', () => {
  const { hub, engine } = setup();
  const round = new Round({ number: 1, type: math, question: { correctAnswer: '56' }, startedAt: 0, limitMs: 20000 });
  round.submit(makeEvent('chat', { user: { id: 'fast', name: 'Fast' }, text: '56', receivedAt: 1000 }));
  round.submit(makeEvent('chat', { user: { id: 'giver', name: 'Giver' }, text: '56', receivedAt: 5000 }));
  hub.emit('event', gift('Giver', 'Lion', 10, 29999));
  assert.equal(round.summary().winner.name, 'Fast');
});
