// All game types. Each one is its own module with the same shape:
// { key, name, instructions, createQuestion(difficulty), normalizeAnswer(text), isCorrect(text, question) }
import math from './math.js';

export const GAME_TYPES = { [math.key]: math };
