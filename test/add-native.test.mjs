import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addNative, parseSpec } from '../scripts/add-native.mjs';
import { pinRecipe } from '../scripts/pin-recipe.mjs';

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'add-native-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(dir, relative, value) {
  const target = path.join(dir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value));
}
const read = (dir, relative) => JSON.parse(fs.readFileSync(path.join(dir, relative), 'utf8'));

test('package specs accept exact versions and reject ranges', () => {
  assert.deepEqual(parseSpec('pi-x@1.2.3'), { name: 'pi-x', version: '1.2.3' });
  assert.deepEqual(parseSpec('@scope/pi-x'), { name: '@scope/pi-x', version: undefined });
  assert.throws(() => parseSpec('pi-x@^1.2.3'), /exact/);
  assert.throws(() => parseSpec('pi-x@latest'), /exact/);
  assert.throws(() => parseSpec('Bad Name'), /Invalid/);
});

test('adding a native package pins registry version, preserves entry metadata and refreshes the lock', t => {
  const dir = temporary(t), calls = [];
  put(dir, 'native/package.json', { name: 'pi-extensions', dependencies: { 'pi-b': '1.0.0' } });
  put(dir, 'config/pi.settings.json', { packages: ['npm:pi-b@1.0.0', { source: 'npm:pi-a@0.1.0', extensions: [] }], theme: 'x' });
  const run = (command, args, options) => {
    calls.push([command, args, options.cwd]);
    return { status: 0, stdout: args[0] === 'view' ? '"0.2.0"' : '' };
  };
  assert.equal(addNative({ name: 'pi-a' }, { dir, run }), 'npm:pi-a@0.2.0');
  assert.deepEqual(read(dir, 'native/package.json').dependencies, { 'pi-a': '0.2.0', 'pi-b': '1.0.0' });
  assert.deepEqual(read(dir, 'config/pi.settings.json'), {
    packages: ['npm:pi-b@1.0.0', { source: 'npm:pi-a@0.2.0', extensions: [] }], theme: 'x',
  });
  assert.deepEqual(calls.at(-1), ['npm', ['install', '--package-lock-only', '--legacy-peer-deps', '--ignore-scripts'], path.join(dir, 'native')]);
  addNative({ name: 'pi-c', version: '3.0.0' }, { dir, run });
  assert.equal(read(dir, 'config/pi.settings.json').packages.at(-1), 'npm:pi-c@3.0.0');
});

test('recipe pinning derives the release id from the harness commit and Pi version', t => {
  const dir = temporary(t), head = 'a'.repeat(40);
  put(dir, 'manifests/packages.json', { piVersion: '9.9.9', packages: [] });
  put(dir, 'manifests/active-release.json', { schemaVersion: 1, release: 'h-old', piVersion: '1.0.0', runtime: { node: 'v1.0.0' },
    sources: { harness: 'b'.repeat(40), subagents: 'c'.repeat(40), memory: 'd'.repeat(40) } });
  const recipe = pinRecipe({ dir, head, nodeVersion: 'v22.0.0' });
  assert.equal(recipe.release, `h-${'a'.repeat(12)}-s-${'c'.repeat(12)}-m-${'d'.repeat(12)}`);
  assert.equal(recipe.piVersion, '9.9.9');
  assert.equal(recipe.runtime.node, 'v22.0.0');
  assert.deepEqual(read(dir, 'manifests/active-release.json'), recipe);
});
