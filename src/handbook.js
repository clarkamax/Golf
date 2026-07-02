import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HANDBOOK_PATH = join(__dirname, '..', 'handbook', 'HANDBOOK.md');

let cached = null;

/**
 * Load the business handbook text (cached after first read).
 * The full contents are injected into Claude's system prompt.
 */
export function loadHandbook() {
  if (cached !== null) return cached;
  try {
    cached = readFileSync(HANDBOOK_PATH, 'utf8').trim();
  } catch (err) {
    console.error(`Could not read handbook at ${HANDBOOK_PATH}:`, err.message);
    cached = '';
  }
  return cached;
}
