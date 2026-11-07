import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { plan, execute } from '../scripts/install.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'interactive-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), source = path.join(root, 'source');
  const put = (base, name, text) => { const file = path.join(base, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  for (const folder of ['guides', 'skills', 'agents']) fs.mkdirSync(path.join(source, folder), { recursive: true });
  fs.mkdirSync(home);
  put(source, 'SYSTEM.md', 'Fixture policy.\n');
  put(source, 'config/pi.settings.json', '{}');
  put(source, 'config/subagents.json', JSON.stringify({ surfaceBackend: 'herdr' }));
  put(source, 'config/SUPERVISOR.md', 'Fixture supervisor.\n');
  put(source, 'manifests/packages.json', JSON.stringify({ packages: [{ name: 'pi-interactive-subagents', path: 'packages/pi-interactive-subagents' }] }));
  return { home, source, put };
}

test('interactive migration replaces obsolete aliases, preserves private profiles and is idempotent', t => {
  const { home, source, put } = fixture(t);
  const old = ['npm:@tintinweb/pi-subagents@0.23.1', 'git:github.com/igalarey/pi-subagents', '/old/packages/@tintinweb/pi-subagents'];
  put(home, '.pi/agent/settings.json', JSON.stringify({ packages: [...old, 'npm:unrelated@1.0.0'], custom: { preserve: true } }));
  put(home, '.pi/agent/agents/private.md', 'Private profile bytes.\n');
  put(home, '.pi/agent/agents/worker.md', 'User worker bytes.\n');
  const pending = plan({ home, source, migrateBase: true });
  assert.deepEqual(pending.conflicts, []);
  const backup = execute(pending);
  const settings = JSON.parse(fs.readFileSync(path.join(home, '.pi/agent/settings.json'), 'utf8'));
  assert.deepEqual(settings.packages, ['npm:unrelated@1.0.0', path.join(source, 'packages/pi-interactive-subagents')]);
  assert.deepEqual(settings.custom, { preserve: true });
  for (const [name, expected] of [['private', 'Private profile bytes.\n'], ['worker', 'User worker bytes.\n']]) {
    assert.equal(fs.readFileSync(path.join(home, `.pi/agent/agents/${name}.md`), 'utf8'), expected);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backup, '.pi/agent/settings.json'), 'utf8')).packages, [...old, 'npm:unrelated@1.0.0']);
  const repeat = plan({ home, source, migrateBase: true });
  assert.deepEqual(repeat.conflicts, []);
  assert.deepEqual(repeat.operations, []);
});

test('interactive migration refuses mixed runtime without explicit migration', t => {
  const { home, source, put } = fixture(t);
  put(home, '.pi/agent/settings.json', JSON.stringify({ packages: ['npm:@tintinweb/pi-subagents@0.23.1'] }));
  const pending = plan({ home, source });
  assert.ok(pending.conflicts.some(message => /migration|migrate-base/.test(message)));
  assert.throws(() => execute(pending), /nothing written/);
});

test('interactive migration never retires an already configured interactive runtime', t => {
  const { home, source, put } = fixture(t);
  put(home, '.pi/agent/settings.json', JSON.stringify({ packages: [path.join(source, 'packages/pi-interactive-subagents')] }));
  const pending = plan({ home, source, migrateBase: true });
  assert.deepEqual(pending.conflicts, []);
  assert.deepEqual(pending.migrations, []);
});
