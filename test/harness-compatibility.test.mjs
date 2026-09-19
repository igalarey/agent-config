import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  buildHarnessInventory,
  inventoryJSON,
  verifyHarnessCompatibility,
} from '../scripts/harness-compatibility.mjs';

import { manifestDigest, directoryDigest } from '../scripts/releases.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const put = (root, relative, content) => {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const temporary = t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-compatibility-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
};

function fixture(t) {
  const home = temporary(t);
  const id = 'h-aaaaaaaaaaaa-s-bbbbbbbbbbbb-m-cccccccccccc';
  const releaseRoot = path.join(home, '.agent-config/releases', id);
  const skill = '---\nname: fixture-skill\ndescription: fixture\n---\n';
  put(releaseRoot, 'release.json', JSON.stringify({
    schemaVersion: 2, id, piVersion: '0.85.1', sourceDigest: 'd'.repeat(64),
    sources: {
      harness: { commit: 'a'.repeat(40) }, subagents: { commit: 'b'.repeat(40) }, memory: { commit: 'c'.repeat(40) },
    },
    packages: [{
      name: '@tintinweb/pi-tasks', version: '1.0.0', path: 'packages/@tintinweb/pi-tasks',
      commit: 'a'.repeat(40), extensions: ['src/index.ts'],
    }], files: [],
  }));
  put(releaseRoot, 'packages/@tintinweb/pi-tasks/package.json', JSON.stringify({ name: '@tintinweb/pi-tasks', version: '1.0.0' }));
  put(releaseRoot, 'packages/@tintinweb/pi-tasks/src/index.ts', 'export default function tasks() {}\n');
  put(releaseRoot, 'native/package.json', JSON.stringify({ name: 'native', dependencies: { 'fixture-native': '1.2.3' } }));
  put(releaseRoot, 'native/package-lock.json', JSON.stringify({
    lockfileVersion: 3, packages: {
      '': { dependencies: { 'fixture-native': '1.2.3' } },
      'node_modules/fixture-native': { version: '1.2.3', integrity: 'sha512-fixture' },
    },
  }));
  put(releaseRoot, 'native/node_modules/fixture-native/package.json', JSON.stringify({
    name: 'fixture-native', version: '1.2.3', pi: { extensions: ['./index.ts'] },
  }));
  put(releaseRoot, 'native/node_modules/fixture-native/index.ts', 'import "./helper.ts"; export default function native() {}\n');
  put(releaseRoot, 'native/node_modules/fixture-native/helper.ts', 'export const helper = true;\n');
  fs.mkdirSync(path.join(releaseRoot, 'native/node_modules/.bin'));
  fs.symlinkSync('../fixture-native/index.ts', path.join(releaseRoot, 'native/node_modules/.bin/fixture'));
  put(releaseRoot, 'pi-skills/fixture-skill/SKILL.md', skill);
  put(releaseRoot, 'manifests/curated-skills.json', JSON.stringify({
    schemaVersion: 1,
    source: { package: 'fixture', version: '1.0.0', repository: 'https://example.invalid', integrity: 'fixture', license: 'MIT' },
    skills: ['fixture-skill'], files: { 'fixture-skill/SKILL.md': sha256(skill) },
  }));
  put(releaseRoot, 'manifests/harness-legacy.json', JSON.stringify({ schemaVersion: 1, files: {} }));
  put(releaseRoot, 'config/HARNESS-AUTHORITY.md', '# Fixture authority\n');
  put(releaseRoot, 'prompts/review.md', '# Review\n');
  put(releaseRoot, 'extensions/carbon-tasks/index.ts', 'export default function carbonTasks() {}\n');
  put(releaseRoot, 'themes/carbon.json', '{}\n');
  for (const script of ['harness-compatibility.mjs', 'verify-compatibility.mjs']) {
    fs.mkdirSync(path.join(releaseRoot, 'scripts'), { recursive: true });
    fs.copyFileSync(new URL(`../scripts/${script}`, import.meta.url), path.join(releaseRoot, 'scripts', script));
  }
  const releaseManifest = JSON.parse(fs.readFileSync(path.join(releaseRoot, 'release.json')));
  for (const [relative, content] of [
    ['packages/@tintinweb/pi-subagents/src/ui/agent-widget.ts', 'placement: "belowEditor"'],
    ['packages/pi-subscription-usage/footer.ts', 'statuses.filter(([key]) => key !== "subagents")'],
  ]) {
    put(releaseRoot, relative, content);
    releaseManifest.files.push({ path: relative, sha256: sha256(content), size: Buffer.byteLength(content), mode: '100644', source: 'harness', gitObject: 'a'.repeat(40) });
  }
  releaseManifest.sourceDigest = manifestDigest(releaseManifest);
  put(releaseRoot, 'release.json', JSON.stringify(releaseManifest));
  const inventory = buildHarnessInventory(releaseRoot);
  for (const resource of inventory.resources) {
    let source;
    if (resource.path.startsWith('.pi/agent/skills/')) source = path.join(releaseRoot, 'pi-skills', resource.path.slice('.pi/agent/skills/'.length));
    else if (resource.path === '.pi/agent/HARNESS-AUTHORITY.md') source = path.join(releaseRoot, 'config/HARNESS-AUTHORITY.md');
    else source = path.join(releaseRoot, resource.path.slice('.pi/agent/'.length));
    const target = path.join(home, ...resource.path.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  fs.cpSync(path.join(releaseRoot, 'native'), path.join(home, '.pi/agent/npm'), { recursive: true, verbatimSymlinks: true });
  const inventoryText = inventoryJSON(inventory);
  put(home, '.pi/agent/harness-manifest.json', inventoryText);
  put(home, '.pi/agent/settings.json', JSON.stringify({
    packages: [
      { source: path.join(releaseRoot, 'packages/@tintinweb/pi-tasks').replaceAll('\\', '/'), extensions: [] },
      'npm:fixture-native@1.2.3', 'npm:unrelated@9.9.9',
    ], foreign: { preserve: true },
  }));
  const files = Object.fromEntries(inventory.resources.map(resource => [resource.path, resource.sha256]));
  files['.pi/agent/harness-manifest.json'] = sha256(inventoryText);
  put(home, '.agent-config/state.json', JSON.stringify({ version: 1, release: id, files, nativeDigest: directoryDigest(path.join(releaseRoot, 'native')) }));
  put(home, '.pi/agent/skills/unrelated/SKILL.md', 'user-owned\n');
  put(home, '.pi/agent/status.json', '{"userOwned":true}\n');
  return { home, releaseRoot, inventory };
}

const fakePi = () => ({ status: 0, stdout: 'pi 0.85.1\n', stderr: '' });

test('inventory is derived from the selected release and remains home-relative', t => {
  const { home, inventory } = fixture(t);
  const serialized = JSON.stringify(inventory);
  assert.equal(serialized.includes(home), false);
  assert.equal(inventory.release.id, 'h-aaaaaaaaaaaa-s-bbbbbbbbbbbb-m-cccccccccccc');
  assert.deepEqual(inventory.curatedSkills, ['fixture-skill']);
  assert.equal(inventory.native.directorySha256, directoryDigest(path.join(home, '.pi/agent/npm')));
  const result = verifyHarnessCompatibility({ home, spawn: fakePi, environment: {
    PATH: process.env.PATH, OPENAI_API_KEY: 'must-not-be-forwarded', HTTPS_PROXY: 'http://private.invalid',
  } });
  assert.equal(result.ok, true, result.failures.join('\n'));
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/skills/unrelated/SKILL.md'), 'utf8'), 'user-owned\n');
});

test('stale inventory, missing assets and changed release identity fail independently', t => {
  for (const mode of ['stale', 'asset', 'identity']) {
    const { home } = fixture(t);
    if (mode === 'stale') {
      const manifest = JSON.parse(fs.readFileSync(path.join(home, '.pi/agent/harness-manifest.json')));
      manifest.release.id = 'h-ffffffffffff-s-bbbbbbbbbbbb-m-cccccccccccc';
      put(home, '.pi/agent/harness-manifest.json', JSON.stringify(manifest));
    } else if (mode === 'asset') {
      fs.rmSync(path.join(home, '.pi/agent/skills/fixture-skill/SKILL.md'));
    } else {
      const state = JSON.parse(fs.readFileSync(path.join(home, '.agent-config/state.json')));
      state.release = 'h-ffffffffffff-s-bbbbbbbbbbbb-m-cccccccccccc';
      put(home, '.agent-config/state.json', JSON.stringify(state));
    }
    const result = verifyHarnessCompatibility({ home, spawn: fakePi });
    assert.equal(result.ok, false, mode);
  }
});

test('nested agent-panel/footer changes and source inventory drift are rejected', t => {
  for (const relative of ['packages/@tintinweb/pi-subagents/src/ui/agent-widget.ts', 'packages/pi-subscription-usage/footer.ts']) {
    const { home, releaseRoot } = fixture(t);
    fs.appendFileSync(path.join(releaseRoot, relative), '\n// tampered');
    const result = verifyHarnessCompatibility({ home, spawn: fakePi });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some(message => message.includes(relative)));
  }
  const { home, releaseRoot } = fixture(t);
  const manifest = JSON.parse(fs.readFileSync(path.join(releaseRoot, 'release.json')));
  manifest.files = [];
  put(releaseRoot, 'release.json', JSON.stringify(manifest));
  assert.ok(verifyHarnessCompatibility({ home, spawn: fakePi }).failures.some(message => /digest mismatch/.test(message)));
});

test('any Bigpowers npm version and duplicate task activation are rejected', t => {
  const { home } = fixture(t);
  const settingsPath = path.join(home, '.pi/agent/settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath));
  settings.packages.push('npm:bigpowers@99.0.0');
  settings.packages[0].extensions = ['./src/index.ts'];
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  const result = verifyHarnessCompatibility({ home, spawn: fakePi });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(message => /Bigpowers/.test(message)));
  assert.ok(result.failures.some(message => /suppression/.test(message)));
});

test('native helper changes and malformed native digests fail', t => {
  for (const mode of ['helper', 'state']) {
    const { home } = fixture(t);
    if (mode === 'helper') fs.appendFileSync(path.join(home, '.pi/agent/npm/node_modules/fixture-native/helper.ts'), '// modified');
    else {
      const state = JSON.parse(fs.readFileSync(path.join(home, '.agent-config/state.json')));
      state.nativeDigest = 'malformed';
      put(home, '.agent-config/state.json', JSON.stringify(state));
    }
    assert.equal(verifyHarnessCompatibility({ home, spawn: fakePi }).ok, false, mode);
  }
});

test('alternate versions of managed native and local packages fail', t => {
  for (const duplicate of ['npm:fixture-native@0.9.0', '/old-release/packages/@tintinweb/pi-tasks']) {
    const { home } = fixture(t);
    const settings = JSON.parse(fs.readFileSync(path.join(home, '.pi/agent/settings.json')));
    settings.packages.push(duplicate);
    put(home, '.pi/agent/settings.json', JSON.stringify(settings));
    assert.ok(verifyHarnessCompatibility({ home, spawn: fakePi }).failures.some(message => /package identity/.test(message)));
  }
});

test('symlinked deployed resource and native parent directories fail', t => {
  for (const directory of ['extensions', 'npm']) {
    const { home } = fixture(t);
    const original = path.join(home, '.pi/agent', directory);
    const elsewhere = path.join(home, `moved-${directory}`);
    fs.renameSync(original, elsewhere);
    fs.symlinkSync(elsewhere, original);
    assert.equal(verifyHarnessCompatibility({ home, spawn: fakePi }).ok, false, directory);
  }
});

test('malformed state and settings fail without exposing their contents', t => {
  const { home } = fixture(t);
  fs.writeFileSync(path.join(home, '.agent-config/state.json'), '{private-state');
  fs.writeFileSync(path.join(home, '.pi/agent/settings.json'), '{private-settings');
  const result = verifyHarnessCompatibility({ home, spawn: fakePi });
  assert.equal(result.ok, false);
  assert.ok(result.failures.every(message => !message.includes('private-state') && !message.includes('private-settings')));
});

test('projected compatibility command supports --home and a sanitized Pi version process', t => {
  const { home } = fixture(t);
  const bin = path.join(home, 'bin');
  put(home, 'bin/pi', '#!/bin/sh\n[ -z "$OPENAI_API_KEY" ] || exit 9\n[ "$PI_OFFLINE" = 1 ] || exit 8\nprintf "pi 0.85.1\\n"\n');
  fs.chmodSync(path.join(bin, 'pi'), 0o700);
  const command = spawnSync(process.execPath, [path.join(home, '.pi/agent/scripts/verify-compatibility.mjs'), '--home', home], {
    encoding: 'utf8', shell: false, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OPENAI_API_KEY: 'private' },
  });
  assert.equal(command.status, 0, command.stderr);
  assert.match(command.stdout, /Pi harness compatibility: PASS/);
});
