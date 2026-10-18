// Answer parsing for each game type.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import math from '../src/games/math.js';
import { cleanText } from '../src/games/answer-text.js';

const Q = { correctAnswer: '56' };

test('math accepts forgiving ways of writing the answer', () => {
  for (const text of ['56', ' 56!', 'svar 56', 'answer 56', 'Answer: 56 🔥', '56.', '7x8=56', '🎉56🎉']) {
    assert.equal(math.isCorrect(text, Q), true, text);
  }
});

test('math rejects wrong numbers and ignores chat without numbers', () => {
  assert.equal(math.isCorrect('55', Q), false);
  assert.equal(math.isCorrect('560', Q), false);
  assert.equal(math.normalizeAnswer('hello'), null);
  assert.equal(math.normalizeAnswer('lol 😂'), null);
});

test('math questions always have whole-number answers that match the prompt', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    for (let i = 0; i < 300; i++) {
      const q = math.createQuestion(level);
      const [a, op, b] = q.prompt.split(' ');
      const value = { '+': +a + +b, '-': a - b, '×': a * b, '÷': a / b }[op];
      assert.equal(String(value), q.correctAnswer, q.prompt);
      assert.ok(Number.isInteger(value) && value >= 0, q.prompt);
      assert.ok(!q.wrongAnswers.includes(q.correctAnswer));
    }
  }
});

test('cleanText strips case, punctuation and emojis', () => {
  assert.equal(cleanText('  Hello, World!! 🎉 '), 'hello world');
});
