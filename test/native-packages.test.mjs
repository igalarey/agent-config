import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { plan, execute, readJSON, root } from '../scripts/install.mjs';
import { directoryDigest } from '../scripts/releases.mjs';

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-packages-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(dir, relative, content) {
  const target = path.join(dir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

const bigpowersPolicy = {
  source: 'npm:bigpowers@2.88.6',
  extensions: [],
  skills: [
    '.pi/skills/align-grid', '.pi/skills/context7-mcp', '.pi/skills/security-review',
    '.pi/skills/design-interface', '.pi/skills/deepen-architecture', '.pi/skills/elaborate-spec',
    '.pi/skills/grill-me', '.pi/skills/define-language', '.pi/skills/diagnose-root',
    '.pi/skills/enforce-first', '.pi/skills/edit-document', '.pi/skills/simple-english',
    '.pi/skills/smoke-test', '.pi/skills/validate-contracts',
  ],
  prompts: [],
};

test('native defaults pin an exact specialized Bigpowers allowlist', () => {
  const defaults = readJSON(path.join(root, 'config/pi.settings.json')).packages;
  assert.deepEqual(defaults, ['npm:pi-mcp-adapter@2.33.0', 'npm:pi-web-access@0.29.0', bigpowersPolicy, 'npm:pi-ollama@0.1.7']);
  const lock = readJSON(path.join(root, 'native/package-lock.json'));
  for (const entry of defaults) {
    const spec = typeof entry === 'string' ? entry : entry.source;
    const at = spec.lastIndexOf('@'), name = spec.slice(4, at), version = spec.slice(at + 1);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
    assert.equal(lock.packages[''].dependencies[name], version);
  }
});

test('native registration is idempotent, preserves metadata and server config, and hides footer', t => {
  const home = temporary(t);
  put(home, '.pi/agent/settings.json', JSON.stringify({ packages: [
    'npm:unrelated@1.0.0', { source: 'npm:bigpowers', custom: true, extensions: ['extensions/omp-hooks.ts'] },
  ] }));
  put(home, '.pi/agent/mcp.json', JSON.stringify({ mcpServers: { fixture: { command: 'not-executed' } },
    settings: { lazy: true, mcpFooterStatus: 'full' } }));
  const preview = plan({ home });
  assert.equal(readJSON(path.join(home, '.pi/agent/mcp.json')).settings.mcpFooterStatus, 'full');
  execute(preview);
  const config = readJSON(path.join(home, '.pi/agent/mcp.json'));
  assert.deepEqual(config.mcpServers, { fixture: { command: 'not-executed' } });
  assert.deepEqual(config.settings, { lazy: true, mcpFooterStatus: 'off' });
  const packages = readJSON(path.join(home, '.pi/agent/settings.json')).packages;
  assert.ok(packages.includes('npm:unrelated@1.0.0'));
  assert.deepEqual(packages.find(p => p.source?.startsWith('npm:bigpowers')), {
    ...bigpowersPolicy, custom: true,
  });
  assert.deepEqual(plan({ home }).operations, []);
});

test('native migration removes old wrappers only with explicit migration', t => {
  const home = temporary(t);
  put(home, '.pi/agent/settings.json', JSON.stringify({ packages: ['old/pi-mcp', 'old/pi-web-fetch'] }));
  assert.throws(() => execute(plan({ home })), /nothing written/);
  const planned = plan({ home, migrateBase: true });
  execute(planned);
  const packages = readJSON(path.join(home, '.pi/agent/settings.json')).packages;
  assert.ok(!packages.includes('old/pi-mcp') && !packages.includes('old/pi-web-fetch'));
  assert.ok(packages.includes('npm:pi-mcp-adapter@2.33.0'));
  assert.ok(packages.includes('npm:pi-web-access@0.29.0'));
});

test('npm prefix copies are verified and old prefixes are backed up', t => {
  const home = temporary(t), source = temporary(t), target = path.join(home, '.pi/agent/npm');
  put(source, 'node_modules/example/index.js', 'export default 1;');
  put(target, 'node_modules/example/index.js', 'export default 0;');
  const beforeDigest = directoryDigest(target), nativeDigest = directoryDigest(source);
  const backup = execute({ home, conflicts: [], operations: [{ relative: '.pi/agent/npm', target,
    nativeSource: source, nativeDigest, beforeDigest }] });
  assert.equal(directoryDigest(target), nativeDigest);
  assert.equal(directoryDigest(path.join(backup, '.pi/agent/npm')), beforeDigest);
});

test('npm prefix mutations between preview and apply abort without writes', t => {
  const home = temporary(t), source = temporary(t), target = path.join(home, '.pi/agent/npm');
  put(source, 'package.json', '{}');
  const operation = { relative: '.pi/agent/npm', target, nativeSource: source,
    nativeDigest: directoryDigest(source), beforeDigest: null };
  put(target, 'foreign.txt', 'preserve');
  assert.throws(() => execute({ home, conflicts: [], operations: [operation] }), /changed since preview/);
  assert.equal(fs.readFileSync(path.join(target, 'foreign.txt'), 'utf8'), 'preserve');
  assert.equal(fs.existsSync(path.join(home, '.agent-config')), false);
});
