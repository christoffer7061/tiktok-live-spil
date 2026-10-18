// Quiz: a question with four options. Viewers answer A, B, C or D.
// Questions live in data/quiz.json:
// { "question": "...", "options": ["right answer", "wrong", "wrong", "wrong"], "difficulty": "easy" }
// The FIRST option is always the right one. Options are shuffled on screen.
// ("answer": <index> can be added to mark a different option as right.)
import { QuestionBank } from './question-bank.js';
import { stripFiller } from './answer-text.js';

const LETTERS = ['A', 'B', 'C', 'D'];
let bank;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default {
  key: 'quiz',
  name: 'Quiz',
  instructions: 'Type A, B, C or D in the chat',

  createQuestion(difficulty) {
    bank ??= new QuestionBank('quiz.json');
    const item = bank.next(difficulty);
    const right = item.options[item.answer ?? 0];
    const options = shuffle(item.options).slice(0, 4);
    const letter = LETTERS[options.indexOf(right)];
    return {
      prompt: item.question,
      display: item.question,
      options: options.map((text, i) => ({ letter: LETTERS[i], text })),
      correctAnswer: letter,
      answerLabel: `${letter}: ${right}`,
      wrongAnswers: LETTERS.slice(0, options.length).filter((l) => l !== letter),
    };
  },

  // "B", "b", "answer b", "B)", "b!!" -> "B". Anything else is not an answer.
  normalizeAnswer(text) {
    const t = stripFiller(text);
    return /^[a-d]$/.test(t) ? t.toUpperCase() : null;
  },

  isCorrect(text, question) {
    return this.normalizeAnswer(text) === question.correctAnswer;
  },
};
