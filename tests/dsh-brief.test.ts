import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('new briefs start empty, explicit resume preserves work and the preview uses the DSH origin', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'studio-brief-'));
  const run = (...args: string[]) => Bun.spawnSync(['bun', join(import.meta.dir, '../bin/design-studio'), 'brief', ...args], { cwd, env: { ...process.env, DSH_SESSION_ID: 'first', DSH_WEB_URL: 'http://192.168.1.50:3080/' } });
  try {
    mkdirSync(join(cwd, '.design/drafts'), { recursive: true });
    const started = run('new', 'landing');
    expect(started.exitCode).toBe(0);
    const result = JSON.parse(started.stdout.toString());
    expect(result.url).toBe('http://192.168.1.50:3080/design-studio/first/');
    writeFileSync(join(result.root, 'context.md'), 'original');
    expect(run('new', 'landing').exitCode).not.toBe(0);
    expect(run('new', 'checkout').exitCode).toBe(0);
    expect(readFileSync(join(cwd, '.design/sessions/first'), 'utf8')).toBe('checkout');
    expect(run('resume', 'landing').exitCode).toBe(0);
    expect(readFileSync(join(cwd, '.design/sessions/first'), 'utf8')).toBe('landing');
    expect(readFileSync(join(result.root, 'context.md'), 'utf8')).toBe('original');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
