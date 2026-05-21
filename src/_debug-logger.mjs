import { appendFileSync, writeFileSync } from 'node:fs';

const LOG_FILE = '/tmp/axhy-debug-trace.log';
let _enabled = true;

export function resetLog() {
  writeFileSync(LOG_FILE, '');
}

export function enableDebug(val = true) {
  _enabled = val;
}

export function dbg(module, fn, msg, data = null) {
  if (!_enabled) return;
  const ts = new Date().toISOString().slice(11, 23);
  let line = `[${ts}] ${module}::${fn} — ${msg}`;
  if (data !== null && data !== undefined) {
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 0);
    line += ` | ${str.length > 300 ? str.slice(0, 300) + '...' : str}`;
  }
  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

export { LOG_FILE };
