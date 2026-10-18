import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applyPackageMetadataOverlay } from '../scripts/releases.mjs';
const commit = 'e955e29c51b7a6cce37e1108cd2d6c57a77e151c';
const hash = data => createHash('sha256').update(data).digest('hex');
const encode = data => Buffer.from(`${JSON.stringify(data, null, 2)}\n`);
const original = { name: '@tintinweb/pi-subagents', version: '0.19.0', dependencies: { '@sinclair/typebox': '^0.34.49', typebox: '^1.3.7', croner: '^10.0.1' }, devDependencies: {}, peerDependencies: {} };
const result = { ...original, dependencies: { croner: '^10.0.1' }, devDependencies: { '@sinclair/typebox': '^0.34.49', typebox: '^1.3.7' }, peerDependencies: { '@sinclair/typebox': '*', typebox: '*' } };
const content = encode(original);
const overlay = { schemaVersion: 1, commit, piVersion: '1.3.0', path: 'package.json', originalSha256: hash(content), resultSha256: hash(encode(result)) };
test('package metadata transformation is explicit and hash-gated', () => {
  assert.deepEqual(applyPackageMetadataOverlay(content, overlay, commit, '1.3.0'), encode(result));
  for (const patch of [{ path: 'src/index.ts' }, { commit: '0'.repeat(40) }, { piVersion: '0.87.1' }, { originalSha256: '0'.repeat(64) }, { resultSha256: '0'.repeat(64) }]) {
    assert.throws(() => applyPackageMetadataOverlay(content, { ...overlay, ...patch }, commit, '1.3.0'), /metadata overlay/);
  }
});
test('lock transformation retains resolved bytes and makes TypeBox development-only', () => {
  const lock = { name: original.name, version: original.version, lockfileVersion: 3, packages: { '': original, 'node_modules/typebox': { version: '1.3.7', integrity: 'unchanged' }, 'node_modules/@sinclair/typebox': { version: '0.34.49', integrity: 'unchanged-legacy' } } };
  const expected = structuredClone(lock); expected.packages[''] = result;
  expected.packages['node_modules/typebox'].dev = true;
  expected.packages['node_modules/@sinclair/typebox'].dev = true;
  const input = encode(lock);
  assert.deepEqual(applyPackageMetadataOverlay(input, { ...overlay, path: 'package-lock.json', originalSha256: hash(input), resultSha256: hash(encode(expected)) }, commit, '1.3.0'), encode(expected));
});
