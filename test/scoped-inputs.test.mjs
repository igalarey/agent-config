import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as inputs from './fixtures/scoped-inputs.mjs';
import * as smoke from '../scripts/runtime-smoke.mjs';

test('scoped input selection rejects partial candidate inputs and invalid provenance without source fallback', t => {
  assert.equal(typeof inputs.scopedInputs, 'function');
  for (const key of ['PI_SCOPED_CANDIDATE', 'PI_SCOPED_NATIVE', 'PI_SCOPED_BROWSER', 'PI_SCOPED_HARNESS_COMMIT']) {
    assert.throws(() => inputs.scopedInputs({ [key]: '/invalid' }), /candidate/i);
  }
  const work = fs.mkdtempSync(path.resolve('.scoped-inputs-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  assert.throws(() => inputs.scopedInputs({ PI_SCOPED_CANDIDATE: work, PI_SCOPED_NATIVE: work,
    PI_SCOPED_BROWSER: work, PI_SCOPED_HARNESS_COMMIT: 'a'.repeat(40),
    PI_SCOPED_COORDINATOR: path.resolve('../pi-project-sessions-coordinator'), PI_RESEARCH_UPSTREAM_PACKAGE: work }), /candidate|release/i);
});

test('scoped mandatory gate rejects absent native markers and incomplete provider registration', () => {
  assert.equal(typeof smoke.assertScopedProfileCapabilities, 'function');
  assert.throws(() => smoke.assertScopedProfileCapabilities([], undefined), /scoped/i);
  const markers = { version: 1, personalSkillCatalog: true, perParentChildLimit: true, persistedExtensionBindings: true, scopedExtensionProfiles: true };
  assert.throws(() => smoke.assertScopedProfileCapabilities([], markers), /scoped/i);
});

test('explicit source export verifies Git object bytes and executable modes instead of trusting a SHA label', t => {
  const work = fs.mkdtempSync(path.resolve('.scoped-export-test-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  assert.equal(typeof inputs.exportPinnedNative, 'function');
  const exported = path.join(work, 'native');
  const receipt = inputs.exportPinnedNative(exported);
  assert.equal(receipt.commit, '21628a941dbcca3678d659e722b5a8fd10f18105');
  assert.equal(receipt.tree, 'cd1576318100d6d032f4ac0bb25222e678abdb94');
  assert(fs.existsSync(path.join(exported, 'pi-extension/subagents/lineage-mutex.ts')), 'SQLite mutex must be in the exact native export');
  assert(receipt.files > 0);
  const file = path.join(exported, 'package.json');
  const original = fs.readFileSync(file);
  fs.appendFileSync(file, '\n');
  assert.throws(() => inputs.validateNativeExport(exported), /export.*bytes/i);
  fs.writeFileSync(file, original);
  fs.chmodSync(file, 0o755);
  assert.throws(() => inputs.validateNativeExport(exported), /export.*mode/i);
});
