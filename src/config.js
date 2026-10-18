// Loads config.json from the project root. Missing keys fall back to defaults.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// GAME_CONFIG=other.json npm start uses another settings file.
export function loadConfig(file = process.env.GAME_CONFIG || path.join(ROOT, 'config.json')) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return {
    port: 3000,
    connection: 'simulator',
    tiktokUsername: '',
    ...raw,
  };
}
