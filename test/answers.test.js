// Answer parsing for each game type.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import math from '../src/games/math.js';
import quiz from '../src/games/quiz.js';
import truefalse from '../src/games/truefalse.js';
import { cleanText } from '../src/games/answer-text.js';
import { readFileSync } from 'node:fs';

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

test('quiz accepts A–D in any case and with filler words', () => {
  const q = { correctAnswer: 'B' };
  for (const text of ['B', 'b', ' b!', 'answer b', 'B)', 'svar B', '🔥 b 🔥', 'its b']) {
    assert.equal(quiz.isCorrect(text, q), true, text);
  }
  assert.equal(quiz.isCorrect('c', q), false);
  assert.equal(quiz.normalizeAnswer('bye'), null, 'words starting with a letter are not answers');
  assert.equal(quiz.normalizeAnswer('a lot'), null);
  assert.equal(quiz.normalizeAnswer('e'), null);
});

test('quiz questions shuffle options but keep the right answer', () => {
  for (let i = 0; i < 100; i++) {
    const q = quiz.createQuestion('easy');
    assert.equal(q.options.length, 4);
    const right = q.options.find((o) => o.letter === q.correctAnswer);
    assert.equal(q.answerLabel, `${right.letter}: ${right.text}`);
  }
});

test('true/false accepts T, F, true and false', () => {
  const qt = { correctAnswer: 'T' };
  for (const text of ['T', 't', 'true', 'TRUE!', 'its true', 'answer t']) assert.equal(truefalse.isCorrect(text, qt), true, text);
  for (const text of ['F', 'false', 'f!']) assert.equal(truefalse.isCorrect(text, qt), false, text);
  assert.equal(truefalse.normalizeAnswer('that is fun'), null);
});

test('question files are valid', () => {
  const quizData = JSON.parse(readFileSync(new URL('../data/quiz.json', import.meta.url)));
  for (const q of quizData) {
    assert.ok(q.question && q.options.length === 4, q.question);
    assert.equal(new Set(q.options).size, 4, q.question);
  }
  const tf = JSON.parse(readFileSync(new URL('../data/truefalse.json', import.meta.url)));
  for (const q of tf) assert.equal(typeof q.answer, 'boolean', q.statement);
});
