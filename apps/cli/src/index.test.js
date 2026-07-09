import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const cliPath = resolve(import.meta.dirname, '../dist/index.cjs');

test('published CLI artifact is executable', () => {
  const version = execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf8' }).trim();
  assert.equal(version, '0.1.2');
});

test('published CLI exposes required MVP commands', () => {
  const help = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
  for (const command of ['login', 'init', 'pull', 'push', 'status']) {
    assert.match(help, new RegExp(`\\b${command}\\b`));
  }
});
