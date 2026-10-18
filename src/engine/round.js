// One round = one question. Records each viewer's FIRST answer with its
// answer time, and keeps the correct answers sorted fastest first.
import { computePoints } from './scoring.js';

export class Round {
  constructor({ number, type, question, startedAt, limitMs, maxPoints = 1000 }) {
    this.number = number;
    this.type = type;          // game type module
    this.question = question;  // from type.createQuestion()
    this.startedAt = startedAt;
    this.limitMs = limitMs;
    this.maxPoints = maxPoints;
    this.answered = new Map(); // userId -> { correct, ms, points }
    this.correct = [];         // [{ userId, name, ms, points }], fastest first
    this.wrongCount = 0;
  }

  // Returns what happened to this chat message:
  // 'correct' | 'wrong' | 'ignored' (not an answer) | 'duplicate' | 'late' | 'early'
  submit(event) {
    const ms = event.receivedAt - this.startedAt;
    if (ms < 0) return 'early';
    if (ms > this.limitMs) return 'late';
    const userId = event.user.id;
    if (this.answered.has(userId)) return 'duplicate';
    // Normal chatter ("hi", "lol") is not an answer and does not use up your try.
    if (this.type.normalizeAnswer(event.text, this.question) == null) return 'ignored';

    const correct = this.type.isCorrect(event.text, this.question);
    const points = correct ? computePoints(ms, this.limitMs, this.maxPoints) : 0;
    this.answered.set(userId, { correct, ms, points });
    if (!correct) {
      this.wrongCount++;
      return 'wrong';
    }
    // Insert sorted by answer time. On an exact tie the one received first
    // stays ahead, because we insert after every entry with the same time.
    const entry = { userId, name: event.user.name, ms, points };
    let i = this.correct.length;
    while (i > 0 && this.correct[i - 1].ms > ms) i--;
    this.correct.splice(i, 0, entry);
    return 'correct';
  }

  get answerCount() {
    return this.answered.size;
  }

  get winner() {
    return this.correct[0] ?? null;
  }

  summary() {
    return {
      number: this.number,
      correctAnswer: this.question.correctAnswer,
      winner: this.winner,
      top3: this.correct.slice(0, 3),
      correctCount: this.correct.length,
      answerCount: this.answerCount,
    };
  }
}
