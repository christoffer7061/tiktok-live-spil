// All game types. Each one is its own module with the same shape:
// { key, name, instructions, createQuestion(difficulty), normalizeAnswer(text), isCorrect(text, question) }
// To add a game type: create a module like these and add it here.
import math from './math.js';
import quiz from './quiz.js';
import truefalse from './truefalse.js';

export const GAME_TYPES = Object.fromEntries([math, quiz, truefalse].map((g) => [g.key, g]));
