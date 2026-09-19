import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resource } from './support.mjs';

test('optional launcher resolves Pi from PATH and preserves argument boundaries', { skip: process.platform === 'win32' }, t => {
  const bin = mkdtempSync(join(tmpdir(), 'carbon-launcher-'));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  writeFileSync(join(bin, 'pi'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(bin, 'ghostty'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
  const result = spawnSync('sh', [resource('config/launchers/pi-carbon'), '--session', 'path with spaces; literal'], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const args = result.stdout.trimEnd().split('\n');
  assert.deepEqual(args.slice(-4), ['-e', join(bin, 'pi'), '--session', 'path with spaces; literal']);
  assert.ok(args.includes('--background=1b1e1c'));
});
