// Loads config.json from the project root. Missing keys fall back to defaults.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(file = path.join(ROOT, 'config.json')) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return {
    port: 3000,
    connection: 'simulator',
    tiktokUsername: '',
    ...raw,
  };
}
