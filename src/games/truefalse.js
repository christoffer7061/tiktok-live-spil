// True or false: viewers answer T or F.
// Statements live in data/truefalse.json: { "statement": "...", "answer": true, "difficulty": "easy" }
import { QuestionBank } from './question-bank.js';
import { stripFiller } from './answer-text.js';

const WORDS = { t: 'T', true: 'T', f: 'F', false: 'F' };
let bank;

export default {
  key: 'truefalse',
  name: 'True or False',
  instructions: 'Type T for true or F for false',

  createQuestion(difficulty) {
    bank ??= new QuestionBank('truefalse.json');
    const item = bank.next(difficulty);
    const correct = item.answer ? 'T' : 'F';
    return {
      prompt: item.statement,
      display: item.statement,
      options: [{ letter: 'T', text: 'True' }, { letter: 'F', text: 'False' }],
      correctAnswer: correct,
      answerLabel: item.answer ? 'True' : 'False',
      wrongAnswers: [correct === 'T' ? 'F' : 'T'],
    };
  },

  // "T", "t", "true", "False!", "answer f" -> "T" / "F".
  normalizeAnswer(text) {
    return WORDS[stripFiller(text)] ?? null;
  },

  isCorrect(text, question) {
    return this.normalizeAnswer(text) === question.correctAnswer;
  },
};
