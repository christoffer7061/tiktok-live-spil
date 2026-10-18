// Mental math: plus, minus, times and division with whole-number answers.
import { extractNumber } from './answer-text.js';

const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Number ranges per difficulty.
const LEVELS = {
  easy:   { add: [1, 20],   mul: [2, 10],  div: [2, 10] },
  medium: { add: [10, 100], mul: [3, 12],  div: [3, 12] },
  hard:   { add: [100, 999], mul: [6, 25], div: [6, 15] },
};

export default {
  key: 'math',
  name: 'Quick Math',
  instructions: 'Type the answer in the chat',

  createQuestion(difficulty = 'easy') {
    const level = LEVELS[difficulty] ?? LEVELS.easy;
    const op = pick(['+', '-', '×', '÷']);
    let a, b, answer;
    if (op === '+') {
      a = randInt(...level.add); b = randInt(...level.add); answer = a + b;
    } else if (op === '-') {
      a = randInt(...level.add); b = randInt(...level.add);
      if (b > a) [a, b] = [b, a]; // no negative answers
      answer = a - b;
    } else if (op === '×') {
      a = randInt(...level.mul); b = randInt(2, difficulty === 'hard' ? 12 : 10); answer = a * b;
    } else {
      b = randInt(...level.div); answer = randInt(2, difficulty === 'hard' ? 15 : 10); a = b * answer;
    }
    return {
      prompt: `${a} ${op} ${b}`,
      display: `${a} ${op} ${b} = ?`,
      correctAnswer: String(answer),
      answerLabel: String(answer),
      revealDisplay: `${a} ${op} ${b} = ${answer}`,
      wrongAnswers: [answer + 1, answer - 1, answer + 10, answer - 2, answer + randInt(2, 9)].map(String),
    };
  },

  normalizeAnswer(text) {
    return extractNumber(text);
  },

  isCorrect(text, question) {
    const n = extractNumber(text);
    return n != null && String(n) === question.correctAnswer;
  },
};
