// Reads questions from an editable JSON file and hands them out in random
// order without repeats, until all have been used (then it starts over).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';

export class QuestionBank {
  constructor(file) {
    this.file = path.join(ROOT, 'data', file);
    this.items = JSON.parse(readFileSync(this.file, 'utf8'));
    if (!Array.isArray(this.items) || !this.items.length) throw new Error(`${file} has no questions`);
    this.used = new Set();
  }

  // Prefers questions with the requested difficulty; falls back to any.
  next(difficulty) {
    let pool = this.items.filter((q, i) => !this.used.has(i) && (!q.difficulty || q.difficulty === difficulty));
    if (!pool.length) pool = this.items.filter((_, i) => !this.used.has(i));
    if (!pool.length) {
      this.used.clear();
      pool = this.items;
    }
    const item = pool[Math.floor(Math.random() * pool.length)];
    this.used.add(this.items.indexOf(item));
    return item;
  }
}
