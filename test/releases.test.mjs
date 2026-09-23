import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { execute, plan, readJSON } from '../scripts/install.mjs';
import { inspect } from '../scripts/doctor.mjs';
import { readSourceMap, runBootstrap, validateRecipe } from '../scripts/bootstrap.mjs';
import {
  executeRelease,
  installReleaseDependencies,
  manifestDigest,
  planRelease,
  safeRelative,
  validateRelease,
  verifyRelease,
} from '../scripts/releases.mjs';

function temporary(t, prefix = 'agent-config-release-') {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}
function put(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
function git(repo, args, input) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', input, shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function repository(t, name) {
  const repo = temporary(t, `${name}-`);
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.name', 'Release Fixture']);
  git(repo, ['config', 'user.email', 'release@example.invalid']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  return repo;
}
function commit(repo, message) {
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']);
}
function fileHash(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function packageFiles(repo, name, { subagents = false, extension = 'index.ts' } = {}) {
  const scripts = { typecheck: 'fixture', test: 'fixture' };
  if (subagents) Object.assign(scripts, { 'test:integration': 'fixture', 'test:smoke': 'fixture' });
  put(repo, 'package.json', JSON.stringify({ name, version: '1.0.0', type: 'module', scripts, pi: { extensions: [`./${extension}`] } }));
  put(repo, 'package-lock.json', JSON.stringify({ name, version: '1.0.0', lockfileVersion: 3, packages: { '': { name, version: '1.0.0' } } }));
  put(repo, 'tsconfig.json', '{}');
  put(repo, extension, `export const packageName = ${JSON.stringify(name)};\n`);
  put(repo, `${name === 'observational-memory' ? 'tests' : 'test'}/basic.test.mjs`, 'export {};\n');
  put(repo, 'LICENSE', 'fixture license\n');
  put(repo, 'README.md', `# ${name}\n`);
}
function fixture(t) {
  const harness = repository(t, 'harness-release');
  put(harness, 'SYSTEM.md', 'fixture system\n');
  put(harness, 'agents/worker.md', 'worker release A\n');
  put(harness, 'guides/git.md', 'fixture guide\n');
  put(harness, 'skills/example/SKILL.md', '---\nname: example\ndescription: fixture\n---\n');
  put(harness, 'config/pi.settings.json', JSON.stringify({ theme: 'release-theme', nested: { managed: true } }));
  put(harness, 'config/rtk.config.toml', '[tracking]\nenabled = false\n');
  put(harness, 'manifests/packages.json', JSON.stringify({ piVersion: '0.85.0', packages: [] }));
  put(harness, 'manifests/rtk.json', JSON.stringify({ hook: { path: 'vendor/rtk-pi-hook/rtk.ts', sha256: 'fixture' }, version: '0.0.0' }));
  put(harness, 'vendor/rtk-pi-hook/LICENSE', 'fixture\n');
  put(harness, 'vendor/rtk-pi-hook/PROVENANCE.md', 'fixture\n');
  put(harness, 'vendor/rtk-pi-hook/rtk.ts', 'export default function fixture() {}\n');
  for (const name of ['pi-ask-user-question', 'pi-web-fetch']) packageFiles(path.join(harness, 'vendor', name), name);
  const harnessA = commit(harness, 'harness A');

  const subagents = repository(t, 'subagents-release');
  packageFiles(subagents, 'pi-interactive-subagents', { subagents: true, extension: 'pi-extension/subagents/index.ts' });
  put(subagents, 'config.json.example', '{}\n');
  put(subagents, 'agents/worker.md', 'package default, not effective\n');
  const subagentsCommit = commit(subagents, 'subagents source');

  const memory = repository(t, 'memory-release');
  packageFiles(memory, 'observational-memory', { extension: 'src/index.ts' });
  put(memory, 'vitest.config.ts', 'export default {};\n');
  put(memory, 'agent/observer/prompt.ts', 'export default "fixture";\n');
  const memoryCommit = commit(memory, 'memory source');

  return {
    repositories: { harness, subagents, memory },
    commits: { harness: harnessA, subagents: subagentsCommit, memory: memoryCommit },
  };
}
function prepare(t, home, source) {
  const releasePlan = planRelease({ home, ...source });
  executeRelease(releasePlan);
  return releasePlan;
}
const fixtureHash = 'a'.repeat(64);
const runtimeSmokeHash = createHash('sha256').update(fs.readFileSync(path.resolve('scripts/runtime-smoke.mjs'))).digest('hex');
function runtimeSmoke(version = '0.85.0', failedId) {
  return {
    host: {
      package: '@earendil-works/pi-coding-agent', version, packageSha256: fixtureHash,
      executableSha256: fixtureHash, cliSha256: fixtureHash,
    },
    loader: {
      package: '@earendil-works/pi-coding-agent', version, packageSha256: fixtureHash, loaderSha256: fixtureHash,
      mode: 'official-cli-rpc', entrypoint: 'dist/bundle/cli.js',
    },
    supplemental: {
      mode: 'mock-host-api-direct-tool-execution',
      limitation: 'Not loader evidence; official ExtensionAPI exposes tool metadata but not execute functions.',
    },
    runner: { name: 'scripts/runtime-smoke.mjs', sha256: runtimeSmokeHash },
    results: ['runtime:host', 'runtime:loader', 'runtime:supplemental-tool-execution', 'runtime:process-only', 'runtime:rpc']
      .map(id => ({ id, ok: id !== failedId, durationMs: 0, ...(id === failedId ? { reason: 'injected runtime failure' } : {}) })),
  };
}
function dependencies(home, id) {
  return installReleaseDependencies({
    home, id, apply: true, getNpmVersion: () => '11.6.2-fixture',
    runNpm(cwd, args, _name, phase) {
      assert.deepEqual(args, phase === 'development'
        ? ['ci', '--ignore-scripts', '--include=dev', '--include=optional']
        : ['ci', '--ignore-scripts', '--omit=dev', '--include=optional']);
      put(cwd, 'node_modules/fixture/package.json', '{"name":"fixture"}\n');
      return { status: 0 };
    },
  });
}
function verify(home, id, seen = []) {
  return verifyRelease({
    home, id, apply: true,
    runChecks(check, options) {
      seen.push({ ...check, env: options.env });
      return { ok: true };
    },
    runRuntimeChecks: () => runtimeSmoke(),
  });
}
function ready(t, home, source) {
  const candidate = prepare(t, home, source);
  dependencies(home, candidate.id);
  verify(home, candidate.id);
  return candidate;
}

const settingsPath = '.pi/agent/settings.json';

test('native npm runtime is sealed, deployed intact and refuses unmanaged prefix changes', t => {
  const home = temporary(t), source = fixture(t);
  const defaults = readJSON(path.join(source.repositories.harness, 'config/pi.settings.json'));
  put(source.repositories.harness, 'config/pi.settings.json', JSON.stringify({ ...defaults, packages: ['npm:fixture@1.0.0'] }));
  put(source.repositories.harness, 'native/package.json', '{"name":"native","dependencies":{"fixture":"1.0.0"}}');
  put(source.repositories.harness, 'native/package-lock.json', '{"lockfileVersion":3}');
  source.commits.harness = commit(source.repositories.harness, 'native fixture');
  const candidate = prepare(t, home, source);
  installReleaseDependencies({ home, id: candidate.id, apply: true, getNpmVersion: () => '11.6.2-fixture',
    runNpm(cwd, args, name) {
      if (name === 'native-npm') assert.ok(args.includes('--legacy-peer-deps'));
      put(cwd, 'node_modules/fixture/package.json', '{"name":"fixture","version":"1.0.0"}');
      return { status: 0 };
    },
  });
  assert.equal(verify(home, candidate.id).passed, true);
  execute(plan({ home, release: candidate.id }));
  const installed = path.join(home, '.pi/agent/npm/node_modules/fixture/package.json');
  assert.equal(readJSON(installed).version, '1.0.0');
  assert.deepEqual(plan({ home }).operations, []);
  put(home, '.pi/agent/npm/foreign.txt', 'keep');
  const conflict = plan({ home });
  assert.ok(conflict.conflicts.some(message => /unmanaged changes/.test(message)));
  assert.throws(() => execute(conflict), /nothing written/);
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/npm/foreign.txt'), 'utf8'), 'keep');
  put(candidate.releasePath, 'native/node_modules/fixture/package.json', '{}');
  assert.throws(() => validateRelease({ home, id: candidate.id, requireVerified: true }), /Runtime changed after dependency stage/);
});

test('dependency stage accepts an empty runtime only for a dev-only lock without production dependencies', t => {
  for (const production of [false, true]) {
    const home = temporary(t);
    const source = fixture(t);
    const folder = path.join(source.repositories.harness, 'vendor/pi-ask-user-question');
    const metadata = readJSON(path.join(folder, 'package.json'));
    metadata.devDependencies = { 'fixture-dev': '1.0.0' };
    metadata.peerDependencies = { 'fixture-dev': '1.0.0' };
    if (production) metadata.dependencies = { 'fixture-production': '1.0.0' };
    put(folder, 'package.json', JSON.stringify(metadata));
    put(folder, 'package-lock.json', JSON.stringify({
      name: metadata.name, version: metadata.version, lockfileVersion: 3,
      packages: {
        '': metadata,
        'node_modules/fixture-dev': { version: '1.0.0', dev: true },
        ...(production ? { 'node_modules/fixture-production': { version: '1.0.0' } } : {}),
      },
    }));
    source.commits.harness = commit(source.repositories.harness, 'peer and dev-only runtime fixture');
    const candidate = prepare(t, home, source);
    const install = () => installReleaseDependencies({
      home, id: candidate.id, apply: true, getNpmVersion: () => '11.6.2-fixture',
      runNpm(cwd, _args, name, phase) {
        if (phase !== 'runtime' || name !== metadata.name) put(cwd, 'node_modules/fixture/package.json', '{}');
        return { status: 0 };
      },
    });
    if (production) {
      assert.throws(install, /produced no runtime node_modules/);
    } else {
      assert.equal(install().written, true);
      assert.deepEqual(fs.readdirSync(path.join(candidate.releasePath, 'packages/pi-ask-user-question/node_modules')), []);
      assert.doesNotThrow(() => validateRelease({ home, id: candidate.id, requireDependencies: true }));
    }
  }
});

test('release preview reads exact commits but writes nothing and records no local repository paths', t => {
  const home = temporary(t);
  const source = fixture(t);
  put(source.repositories.harness, 'agents/worker.md', 'uncommitted WIP\n');
  put(source.repositories.harness, 'skills/example/secret.env', 'not committed\n');

  const candidate = planRelease({ home, ...source });
  assert.deepEqual(fs.readdirSync(home), []);
  assert.match(candidate.id, /^h-[0-9a-f]{12}-s-[0-9a-f]{12}-m-[0-9a-f]{12}$/);
  assert.equal(candidate.files.find(item => item.path === 'agents/worker.md').content.toString(), 'worker release A\n');
  const serialized = JSON.stringify(candidate.manifest);
  for (const repo of Object.values(source.repositories)) assert.equal(serialized.includes(repo), false);
  assert.throws(() => planRelease({ home, repositories: source.repositories, commits: { ...source.commits, harness: 'main' } }), /full hexadecimal object id/);
});

test('committed prompt templates are carried into a release while older sources may omit the directory', t => {
  const home = temporary(t);
  const source = fixture(t);
  assert.equal(planRelease({ home, ...source }).files.some(file => file.path.startsWith('prompts/')), false);

  put(source.repositories.harness, 'prompts/review.md', '---\ndescription: Review changes\nargument-hint: "[scope]"\n---\nReview ${ARGUMENTS:-the current context}.\n');
  source.commits.harness = commit(source.repositories.harness, 'add prompt template');
  const candidate = planRelease({ home, ...source });
  assert.equal(candidate.files.find(file => file.path === 'prompts/review.md')?.content.toString(),
    '---\ndescription: Review changes\nargument-hint: "[scope]"\n---\nReview ${ARGUMENTS:-the current context}.\n');
});

test('browser package is carried through new releases without changing legacy four-package candidates', t => {
  const home = temporary(t);
  const source = fixture(t);
  const legacy = ready(t, home, source);
  assert.equal(legacy.manifest.packages.length, 4);
  execute(plan({ home, release: legacy.id }));

  const browserRoot = path.join(source.repositories.harness, 'vendor/pi-browser');
  packageFiles(browserRoot, 'pi-browser');
  put(source.repositories.harness, 'manifests/packages.json', JSON.stringify({
    piVersion: '0.85.0', packages: [{ name: 'pi-browser', path: 'vendor/pi-browser' }],
  }));
  source.commits.harness = commit(source.repositories.harness, 'optional browser');
  const candidate = prepare(t, home, source);
  assert.equal(candidate.manifest.packages.length, 5);
  assert.deepEqual(candidate.manifest.packages.at(-1), {
    name: 'pi-browser', path: 'packages/pi-browser', version: '1.0.0', source: 'harness',
    commit: source.commits.harness, extensions: ['index.ts'],
  });
  assert.ok(candidate.files.some(file => file.path === 'packages/pi-browser/package-lock.json'));
  assert.equal(candidate.files.some(file => file.path.startsWith('vendor/pi-browser/')), false);
  assert.equal(installReleaseDependencies({ home, id: candidate.id }).commands.length, 10);
  dependencies(home, candidate.id);
  const checked = verify(home, candidate.id);
  assert.equal(checked.fullChecks.length, 12);
  assert.deepEqual(checked.fullChecks.slice(-2).map(check => check.id), ['pi-browser:typecheck', 'pi-browser:test']);
  assert.equal(validateRelease({ home, id: candidate.id, requireVerified: true }).manifest.packages.length, 5);
  assert.equal(plan({ home }).release, legacy.id);
  assert.deepEqual(plan({ home }).operations, []);
  execute(plan({ home, release: candidate.id }));
  assert.equal(plan({ home }).release, candidate.id);
  assert.deepEqual(plan({ home }).operations, []);
  const settings = readJSON(path.join(home, settingsPath));
  settings.packages = settings.packages.map(entry => entry.endsWith('/pi-browser')
    ? { source: entry, extensions: [], custom: 'managed-path-metadata' } : entry);
  const unrelated = { source: 'npm:foreign-browser@1.0.0', custom: 'preserve' };
  settings.packages.push(unrelated);
  put(home, settingsPath, JSON.stringify(settings));
  const rollback = plan({ home, release: legacy.id });
  assert.deepEqual(rollback.migrations.filter(item => item.to === null).map(item => item.name), ['pi-browser']);
  execute(rollback);
  assert.equal(plan({ home }).release, legacy.id);
  assert.deepEqual(plan({ home }).operations, []);
  const rolledBack = readJSON(path.join(home, settingsPath));
  assert.equal(rolledBack.packages.length, 5);
  assert.deepEqual(rolledBack.packages.at(-1), unrelated);
});

test('a declared browser package cannot silently disappear from the committed release', t => {
  const home = temporary(t);
  const source = fixture(t);
  put(source.repositories.harness, 'manifests/packages.json', JSON.stringify({
    piVersion: '0.85.0', packages: [{ name: 'pi-browser', path: 'vendor/pi-browser' }],
  }));
  source.commits.harness = commit(source.repositories.harness, 'missing browser source');
  assert.throws(() => planRelease({ home, ...source }), /Required committed file missing: harness:vendor\/pi-browser\/package.json/);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('MCP is a sixth package and rollback preserves the previous sealed browser release', t => {
  const home = temporary(t);
  const source = fixture(t);
  packageFiles(path.join(source.repositories.harness, 'vendor/pi-browser'), 'pi-browser');
  source.commits.harness = commit(source.repositories.harness, 'browser baseline');
  const previous = ready(t, home, source);
  execute(plan({ home, release: previous.id }));
  packageFiles(path.join(source.repositories.harness, 'vendor/pi-mcp'), 'pi-mcp');
  source.commits.harness = commit(source.repositories.harness, 'MCP integration');
  const candidate = prepare(t, home, source);
  assert.equal(candidate.manifest.packages.length, 6);
  assert.equal(candidate.manifest.packages.at(-1).name, 'pi-mcp');
  assert.ok(candidate.files.some(file => file.path === 'packages/pi-mcp/package-lock.json'));
  assert.equal(installReleaseDependencies({ home, id: candidate.id }).commands.length, 12);
  dependencies(home, candidate.id);
  assert.equal(verify(home, candidate.id).fullChecks.length, 14);
  execute(plan({ home, release: candidate.id }));
  const settings = readJSON(path.join(home, settingsPath));
  const unrelated = { source: 'npm:unrelated-mcp@1.0.0', custom: 'preserve' };
  settings.packages.push(unrelated);
  put(home, settingsPath, JSON.stringify(settings));
  const rollback = plan({ home, release: previous.id });
  assert.deepEqual(rollback.migrations.filter(item => item.to === null).map(item => item.name), ['pi-mcp']);
  execute(rollback);
  assert.equal(plan({ home }).release, previous.id);
  assert.deepEqual(plan({ home }).operations, []);
  assert.deepEqual(readJSON(path.join(home, settingsPath)).packages.at(-1), unrelated);
  assert.ok(fs.existsSync(path.join(candidate.releasePath, 'packages/pi-mcp/index.ts')));
});

test('a declared MCP package cannot disappear from the committed release', t => {
  const home = temporary(t);
  const source = fixture(t);
  put(source.repositories.harness, 'manifests/packages.json', JSON.stringify({
    piVersion: '0.85.0', packages: [{ name: 'pi-mcp', path: 'vendor/pi-mcp' }],
  }));
  source.commits.harness = commit(source.repositories.harness, 'missing MCP source');
  assert.throws(() => planRelease({ home, ...source }), /Required committed file missing: harness:vendor\/pi-mcp\/package.json/);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('subscription usage is a seventh package and rollback preserves sealed packages and foreign settings', t => {
  const home = temporary(t);
  const source = fixture(t);
  for (const name of ['pi-browser', 'pi-mcp']) {
    packageFiles(path.join(source.repositories.harness, 'vendor', name), name);
  }
  source.commits.harness = commit(source.repositories.harness, 'six-package baseline');
  const previous = ready(t, home, source);
  execute(plan({ home, release: previous.id }));
  packageFiles(path.join(source.repositories.harness, 'vendor/pi-subscription-usage'), 'pi-subscription-usage');
  source.commits.harness = commit(source.repositories.harness, 'subscription usage integration');
  const candidate = prepare(t, home, source);
  assert.equal(candidate.manifest.packages.length, 7);
  assert.equal(candidate.manifest.packages.at(-1).name, 'pi-subscription-usage');
  assert.ok(candidate.files.some(file => file.path === 'packages/pi-subscription-usage/package-lock.json'));
  assert.equal(candidate.files.some(file => file.path.startsWith('vendor/pi-subscription-usage/')), false);
  assert.equal(installReleaseDependencies({ home, id: candidate.id }).commands.length, 14);
  dependencies(home, candidate.id);
  const checked = verify(home, candidate.id);
  assert.equal(checked.fullChecks.length, 16);
  assert.deepEqual(checked.fullChecks.slice(-2).map(check => check.id),
    ['pi-subscription-usage:typecheck', 'pi-subscription-usage:test']);
  execute(plan({ home, release: candidate.id }));
  const settings = readJSON(path.join(home, settingsPath));
  const unrelated = { source: 'npm:foreign-footer@1.0.0', custom: 'preserve' };
  settings.packages.push(unrelated);
  put(home, settingsPath, JSON.stringify(settings));
  const rollback = plan({ home, release: previous.id });
  assert.deepEqual(rollback.migrations.filter(item => item.to === null).map(item => item.name), ['pi-subscription-usage']);
  execute(rollback);
  assert.equal(plan({ home }).release, previous.id);
  assert.deepEqual(plan({ home }).operations, []);
  assert.deepEqual(readJSON(path.join(home, settingsPath)).packages.at(-1), unrelated);
  assert.ok(fs.existsSync(path.join(candidate.releasePath, 'packages/pi-subscription-usage/index.ts')));
});

test('a declared subscription usage package cannot disappear from the committed release', t => {
  const home = temporary(t);
  const source = fixture(t);
  put(source.repositories.harness, 'manifests/packages.json', JSON.stringify({
    piVersion: '0.85.0', packages: [{ name: 'pi-subscription-usage', path: 'vendor/pi-subscription-usage' }],
  }));
  source.commits.harness = commit(source.repositories.harness, 'missing subscription usage source');
  assert.throws(() => planRelease({ home, ...source }), /Required committed file missing: harness:vendor\/pi-subscription-usage\/package.json/);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('subagents UI overlay projects its pinned edits and remains optional', t => {
  const home = temporary(t);
  const source = fixture(t);
  const subagents = source.repositories.subagents;
  put(subagents, 'src/ui/agent-widget.ts', 'ui.setWidget("agents", factory, { placement: "aboveEditor" });\n');
  put(subagents, 'test/agent-color-surfaces.test.ts', 'expect(placement).toBe("aboveEditor");\n');
  put(subagents, 'test/rpc-lifecycle-gating.test.ts', 'expect(options).toEqual({ placement: "aboveEditor" });\n');
  source.commits.subagents = commit(subagents, 'subagents UI baseline');
  put(source.repositories.harness, 'manifests/subagents-ui.json', JSON.stringify({
    commit: source.commits.subagents,
    files: [
      {
        path: 'src/ui/agent-widget.ts',
        originalSha256: fileHash(path.join(subagents, 'src/ui/agent-widget.ts')),
        oldText: 'placement: "aboveEditor"',
        newText: 'placement: "belowEditor"',
      },
      {
        path: 'test/agent-color-surfaces.test.ts',
        originalSha256: fileHash(path.join(subagents, 'test/agent-color-surfaces.test.ts')),
        oldText: 'expect(placement).toBe("aboveEditor")',
        newText: 'expect(placement).toBe("belowEditor")',
      },
      {
        path: 'test/rpc-lifecycle-gating.test.ts',
        originalSha256: fileHash(path.join(subagents, 'test/rpc-lifecycle-gating.test.ts')),
        oldText: 'placement: "aboveEditor"', newText: 'placement: "belowEditor"',
      },
    ],
  }));
  source.commits.harness = commit(source.repositories.harness, 'subagents UI overlay');
  const candidate = prepare(t, home, source);
  assert.equal(candidate.files.find(file => file.path === 'packages/pi-interactive-subagents/src/ui/agent-widget.ts').content.toString(),
    'ui.setWidget("agents", factory, { placement: "belowEditor" });\n');
  assert.equal(candidate.files.find(file => file.path === 'packages/pi-interactive-subagents/test/agent-color-surfaces.test.ts').content.toString(),
    'expect(placement).toBe("belowEditor");\n');

  const absent = fixture(t);
  assert.doesNotThrow(() => planRelease({ home: temporary(t), ...absent }));

  const mismatch = fixture(t);
  const mismatchSubagents = mismatch.repositories.subagents;
  put(mismatchSubagents, 'src/ui/agent-widget.ts', 'ui.setWidget("agents", factory, { placement: "aboveEditor" });\n');
  put(mismatchSubagents, 'test/agent-color-surfaces.test.ts', 'expect(placement).toBe("aboveEditor");\n');
  put(mismatchSubagents, 'test/rpc-lifecycle-gating.test.ts', 'expect(options).toEqual({ placement: "aboveEditor" });\n');
  mismatch.commits.subagents = commit(mismatchSubagents, 'subagents UI mismatch baseline');
  put(mismatch.repositories.harness, 'manifests/subagents-ui.json', JSON.stringify({
    commit: mismatch.commits.subagents,
    files: [
      { path: 'src/ui/agent-widget.ts', originalSha256: 'a'.repeat(64), oldText: 'aboveEditor', newText: 'belowEditor' },
      { path: 'test/agent-color-surfaces.test.ts', originalSha256: fileHash(path.join(mismatchSubagents, 'test/agent-color-surfaces.test.ts')), oldText: 'aboveEditor', newText: 'belowEditor' },
      { path: 'test/rpc-lifecycle-gating.test.ts', originalSha256: fileHash(path.join(mismatchSubagents, 'test/rpc-lifecycle-gating.test.ts')), oldText: 'aboveEditor', newText: 'belowEditor' },
    ],
  }));
  mismatch.commits.harness = commit(mismatch.repositories.harness, 'subagents UI mismatch overlay');
  assert.throws(() => planRelease({ home: temporary(t), ...mismatch }), /does not match pinned source/);
  const overlayPath = path.join(mismatch.repositories.harness, 'manifests/subagents-ui.json');
  const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
  overlay.files[0].originalSha256 = fileHash(path.join(mismatchSubagents, overlay.files[0].path));
  overlay.commit = 'f'.repeat(40);
  put(mismatch.repositories.harness, 'manifests/subagents-ui.json', JSON.stringify(overlay));
  mismatch.commits.harness = commit(mismatch.repositories.harness, 'wrong overlay commit');
  assert.throws(() => planRelease({ home: temporary(t), ...mismatch }), /does not match pinned source/);
  overlay.commit = mismatch.commits.subagents;
  for (const oldText of ['missing text', 'e']) {
    overlay.files[0].oldText = oldText;
    put(mismatch.repositories.harness, 'manifests/subagents-ui.json', JSON.stringify(overlay));
    mismatch.commits.harness = commit(mismatch.repositories.harness, 'nonunique overlay replacement');
    assert.throws(() => planRelease({ home: temporary(t), ...mismatch }), /replacement is not unique/);
  }
});

test('release CLI accepts a machine-local source map and remains preview-only by default', t => {
  const home = temporary(t);
  const mapFolder = temporary(t, 'release-map-');
  const source = fixture(t);
  const sourceMap = path.join(mapFolder, 'sources.json');
  fs.writeFileSync(sourceMap, JSON.stringify(source.repositories));
  const result = spawnSync(process.execPath, [
    path.resolve('scripts/releases.mjs'), '--home', home, '--source-map', sourceMap,
    '--harness-commit', source.commits.harness,
    '--subagents-commit', source.commits.subagents,
    '--memory-commit', source.commits.memory,
  ], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PLAN release h-/);
  assert.match(result.stdout, /No files written/);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('prepared candidate is isolated from later checkout edits and contains the four package sources', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = prepare(t, home, source);
  put(source.repositories.harness, 'agents/worker.md', 'later checkout edit\n');
  fs.rmSync(source.repositories.memory, { recursive: true, force: true });

  assert.equal(fs.readFileSync(path.join(candidate.releasePath, 'agents/worker.md'), 'utf8'), 'worker release A\n');
  assert.deepEqual(readJSON(path.join(candidate.releasePath, 'manifests/packages.json')).packages.map(pkg => pkg.name), [
    'pi-interactive-subagents', 'observational-memory', 'pi-ask-user-question', 'pi-web-fetch',
  ]);
  assert.equal(validateRelease({ home, id: candidate.id }).manifest.sourceDigest, candidate.manifest.sourceDigest);
});

test('portable paths reject Windows ADS, reserved names, and ambiguous suffixes', () => {
  assert.equal(safeRelative('skills/example/SKILL.md'), 'skills/example/SKILL.md');
  for (const unsafe of [
    'skills/example/file.txt:stream', 'skills/CON/readme.md', 'packages/aux.ts',
    'skills/example/trailing.', 'skills/example/trailing ', 'skills/example/a?.md',
  ]) assert.throws(() => safeRelative(unsafe), /Unsafe repository path/);
});

test('known authentication and credential files are rejected even when committed', t => {
  const home = temporary(t);
  const source = fixture(t);
  for (const filename of ['auth.json', 'credentials.json']) {
    put(source.repositories.harness, `skills/example/${filename}`, '{}\n');
    source.commits.harness = commit(source.repositories.harness, `add ${filename}`);
    assert.throws(() => planRelease({ home, ...source }), new RegExp(`Prohibited committed source path:.*${filename}`));
    fs.rmSync(path.join(source.repositories.harness, `skills/example/${filename}`));
    source.commits.harness = commit(source.repositories.harness, `remove ${filename}`);
  }
  assert.deepEqual(fs.readdirSync(home), []);
});

test('committed symlinks in selected source paths are rejected', t => {
  const home = temporary(t);
  const source = fixture(t);
  const repo = source.repositories.harness;
  const blob = git(repo, ['hash-object', '-w', '--stdin'], '../outside');
  git(repo, ['update-index', '--add', '--cacheinfo', `120000,${blob},skills/example/link`]);
  git(repo, ['commit', '-q', '-m', 'symlink']);
  source.commits.harness = git(repo, ['rev-parse', 'HEAD']);
  assert.throws(() => planRelease({ home, ...source }), /Source symlink not allowed/);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('release validation rejects shared module roots and escaping extension metadata', t => {
  for (const shared of ['node_modules/injected/package.json', 'packages/node_modules/injected/package.json']) {
    const home = temporary(t);
    const candidate = prepare(t, home, fixture(t));
    put(candidate.releasePath, shared, '{"name":"injected"}\n');
    assert.throws(() => validateRelease({ home, id: candidate.id }), /Unexpected shared node_modules/);
  }

  const home = temporary(t);
  const candidate = prepare(t, home, fixture(t));
  const manifestPath = path.join(candidate.releasePath, 'release.json');
  const manifest = readJSON(manifestPath);
  manifest.packages[0].extensions = ['../../SYSTEM.md'];
  manifest.sourceDigest = manifestDigest(manifest);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => validateRelease({ home, id: candidate.id }), /Unsafe repository path|Invalid release extension/);
});

test('dependency and verification phases are explicit and cover integration and smoke offline candidates', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = prepare(t, home, source);
  assert.equal(candidate.manifest.schemaVersion, 2);
  assert.throws(() => validateRelease({ home, id: candidate.id, requireVerified: true }), /dependencies/i);

  const preview = installReleaseDependencies({ home, id: candidate.id });
  assert.equal(preview.written, false);
  assert.equal(preview.commands.length, 8);
  assert.deepEqual(preview.commands.map(command => command.phase), ['development', 'development', 'development', 'development', 'runtime', 'runtime', 'runtime', 'runtime']);
  assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release')), false);
  const dependencyStage = dependencies(home, candidate.id);
  assert.equal(dependencyStage.report.schemaVersion, 2);
  assert.deepEqual(dependencyStage.report.development.npmArgs, ['ci', '--ignore-scripts', '--include=dev', '--include=optional']);
  assert.deepEqual(dependencyStage.report.runtime.npmArgs, ['ci', '--ignore-scripts', '--omit=dev', '--include=optional']);
  assert.equal(dependencyStage.report.development.npm, '11.6.2-fixture');
  assert.equal(dependencyStage.report.runtime.npm, '11.6.2-fixture');
  const contaminated = {
    PI_SUBAGENT_AGENT: 'contaminating-worker', OPENAI_API_KEY: 'do-not-inherit', HTTPS_PROXY: 'http://proxy.invalid',
    NODE_OPTIONS: '--require=do-not-load.cjs', HOME: '/real-home-must-not-leak',
  };
  const previousEnvironment = Object.fromEntries(Object.keys(contaminated).map(key => [key, process.env[key]]));
  Object.assign(process.env, contaminated);
  t.after(() => {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const seen = [];
  const result = verify(home, candidate.id, seen);
  assert.equal(process.env.PI_SUBAGENT_AGENT, 'contaminating-worker');
  assert.equal(process.env.OPENAI_API_KEY, 'do-not-inherit');
  assert.equal(result.passed, true);
  assert.ok(seen.some(check => check.args.join(' ') === 'run test:integration'));
  assert.ok(seen.some(check => check.args.join(' ') === 'run test:smoke'));
  assert.ok(seen.every(check => check.env.PI_RUN_LIVE_SUBAGENT_TESTS === '0'
    && check.env.PI_OFFLINE === '1' && check.env.PI_TELEMETRY === '0'
    && check.env.npm_config_offline === 'true'
    && check.env.HOME.startsWith(path.join(candidate.releasePath, '.release', 'verification-home-'))
    && check.env.PI_E2E_LIVE === '0'
    && !fs.existsSync(check.env.HOME)
    && check.env.OPENAI_API_KEY === undefined && check.env.HTTPS_PROXY === undefined
    && check.env.NODE_OPTIONS === undefined
    && !Object.keys(check.env).some(key => key.toUpperCase().startsWith('PI_SUBAGENT_'))));
  assert.ok(result.timings.sourceValidationMs >= 0 && result.timings.runtimeDigestMs >= 0);
  assert.equal(seen.length, 10);
  assert.ok(seen.every(check => check.cwd.startsWith(path.join(candidate.releasePath, '.release', 'development'))));
  assert.equal(result.runtimeChecks.length, 5);
  assert.equal(result.report.schemaVersion, 2);
  assert.equal(result.report.fullChecks.length, 10);
  assert.equal(result.report.runtimeChecks.length, 5);
  assert.equal(result.report.loader.mode, 'official-cli-rpc');
  assert.equal(result.report.supplemental.mode, 'mock-host-api-direct-tool-execution');
  assert.ok(result.report.runtimeChecks.some(item => item.id === 'runtime:supplemental-tool-execution'));
  assert.equal(result.report.runtime.npm, '11.6.2-fixture');
  assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release', 'development')), false);
  assert.equal(validateRelease({ home, id: candidate.id, requireVerified: true }).id, candidate.id);
});

test('verification never records passed when a check mutates committed candidate sources', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = prepare(t, home, source);
  dependencies(home, candidate.id);
  let mutated = false;
  assert.throws(() => verifyRelease({
    home, id: candidate.id, apply: true,
    runChecks() {
      if (!mutated) {
        fs.appendFileSync(path.join(candidate.releasePath, 'SYSTEM.md'), 'mutated by check\n');
        mutated = true;
      }
      return { ok: true };
    },
    runRuntimeChecks: () => assert.fail('runtime smoke must not execute mutated development source'),
  }), /integrity mismatch/);
  assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release/verification.json')), false);
});

test('verification refuses runtime tampering before executing runtime smoke', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = prepare(t, home, source);
  dependencies(home, candidate.id);
  let mutated = false;
  assert.throws(() => verifyRelease({
    home, id: candidate.id, apply: true,
    runChecks() {
      if (!mutated) {
        put(candidate.releasePath, 'packages/pi-web-fetch/node_modules/fixture/package.json', '{"name":"tampered"}\n');
        mutated = true;
      }
      return { ok: true };
    },
    runRuntimeChecks: () => assert.fail('runtime smoke must not execute a changed runtime'),
  }), /Runtime changed after dependency stage/);
  assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release/development')), true);
});

test('a failed dependency phase leaves no usable report and cannot affect configuration', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = prepare(t, home, source);
  let calls = 0;
  assert.throws(() => installReleaseDependencies({
    home, id: candidate.id, apply: true,
    runNpm(cwd) {
      calls++;
      put(cwd, 'node_modules/partial/package.json', '{}\n');
      return { status: calls === 2 ? 1 : 0 };
    },
  }), /Dependency installation failed/);
  assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release/dependencies.json')), false);
  assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release/dependencies.failed.json')), true);
  assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release/development')), true);
  assert.throws(() => validateRelease({ home, id: candidate.id, requireVerified: true }), /dependencies/i);
  assert.equal(fs.existsSync(path.join(home, settingsPath)), false);
});

test('development tampering and missing stages fail closed without deleting evidence', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = prepare(t, home, source);
  assert.throws(() => verifyRelease({ home, id: candidate.id, runChecks: () => assert.fail('checks must not run') }), /dependencies/i);
  dependencies(home, candidate.id);
  const sharedModules = path.join(candidate.releasePath, '.release/development/node_modules/injected/package.json');
  put(candidate.releasePath, '.release/development/node_modules/injected/package.json', '{"name":"injected"}\n');
  assert.throws(() => verifyRelease({ home, id: candidate.id, runChecks: () => assert.fail('checks must not run') }), /Unexpected shared development node_modules/);
  fs.rmSync(path.dirname(path.dirname(sharedModules)), { recursive: true, force: true });
  const developmentFile = path.join(candidate.releasePath, '.release/development/p3/index.ts');
  fs.appendFileSync(developmentFile, '// tampered development source\n');
  assert.throws(() => verifyRelease({ home, id: candidate.id, runChecks: () => assert.fail('checks must not run') }), /Development integrity mismatch/);
  assert.equal(fs.existsSync(developmentFile), true);
  assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release/verification.json')), false);
});

test('runtime failures and a wrong Pi host are recorded and retain the development tree', t => {
  for (const mode of ['runtime-check', 'wrong-host', 'crashed-smoke']) {
    const home = temporary(t);
    const source = fixture(t);
    const candidate = prepare(t, home, source);
    dependencies(home, candidate.id);
    const smoke = mode === 'wrong-host' ? runtimeSmoke('0.84.0') : runtimeSmoke('0.85.0', 'runtime:rpc');
    const verified = verifyRelease({
      home, id: candidate.id, apply: true, runChecks: () => ({ ok: true }),
      runRuntimeChecks: () => {
        if (mode === 'crashed-smoke') throw new Error('injected smoke crash');
        return smoke;
      },
    });
    assert.equal(verified.passed, false);
    assert.equal(readJSON(path.join(candidate.releasePath, '.release/verification.json')).status, 'failed');
    assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release/development')), true);
    assert.throws(() => validateRelease({ home, id: candidate.id, requireVerified: true }), /verification is not valid/);
  }
});

test('successful verification removes only its development tree and preserves foreign release evidence', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = prepare(t, home, source);
  put(candidate.releasePath, '.release/foreign-evidence.txt', 'preserve me\n');
  dependencies(home, candidate.id);
  verify(home, candidate.id);
  assert.equal(fs.readFileSync(path.join(candidate.releasePath, '.release/foreign-evidence.txt'), 'utf8'), 'preserve me\n');
  assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release/development')), false);
});

test('legacy v1 dependency and verification reports remain valid but cannot mint a new reduced report', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = ready(t, home, source);
  const manifestPath = path.join(candidate.releasePath, 'release.json');
  const manifestV1 = readJSON(manifestPath);
  manifestV1.schemaVersion = 1;
  manifestV1.sourceDigest = manifestDigest(manifestV1);
  fs.writeFileSync(manifestPath, JSON.stringify(manifestV1));
  const dependenciesPath = path.join(candidate.releasePath, '.release/dependencies.json');
  const verificationPath = path.join(candidate.releasePath, '.release/verification.json');
  const dependenciesV2 = readJSON(dependenciesPath);
  const verificationV2 = readJSON(verificationPath);
  const dependenciesV1 = {
    schemaVersion: 1, status: 'passed', sourceDigest: manifestV1.sourceDigest, packages: dependenciesV2.packages,
  };
  fs.writeFileSync(dependenciesPath, JSON.stringify(dependenciesV1));
  const dependenciesDigest = createHash('sha256').update(fs.readFileSync(dependenciesPath)).digest('hex');
  fs.writeFileSync(verificationPath, JSON.stringify({
    schemaVersion: 1, status: 'passed', sourceDigest: manifestV1.sourceDigest, dependenciesDigest,
    runtimeDigest: verificationV2.runtimeDigest, checks: verificationV2.fullChecks,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
  }));
  assert.equal(validateRelease({ home, id: candidate.id, requireVerified: true }).id, candidate.id);
  assert.throws(() => installReleaseDependencies({
    home, id: candidate.id, apply: true, runNpm: () => assert.fail('npm must not run for legacy release'),
  }), /Legacy v1 releases are immutable/);
  execute(plan({ home, release: candidate.id }));
  assert.equal(readJSON(path.join(candidate.releasePath, '.release/activation.json')).schemaVersion, 1);

  const secondHome = temporary(t);
  const second = prepare(t, secondHome, fixture(t));
  const prepared = dependencies(secondHome, second.id);
  fs.writeFileSync(path.join(second.releasePath, '.release/dependencies.json'), JSON.stringify({
    schemaVersion: 1, status: 'passed', sourceDigest: prepared.report.sourceDigest, packages: prepared.report.packages,
  }));
  assert.throws(() => verifyRelease({ home: secondHome, id: second.id, runChecks: () => assert.fail('checks must not run') }), /dependencies are not prepared/);
});

test('sealed schema v2 reports from the previous smoke layout remain valid', t => {
  const home = temporary(t);
  const candidate = ready(t, home, fixture(t));
  const verificationPath = path.join(candidate.releasePath, '.release/verification.json');
  const report = readJSON(verificationPath);
  report.runtimeChecks = report.runtimeChecks.map(item => item.id === 'runtime:supplemental-tool-execution' ? { ...item, id: 'runtime:tools' } : item);
  delete report.loader.mode;
  delete report.loader.entrypoint;
  delete report.supplemental;
  fs.writeFileSync(verificationPath, JSON.stringify(report));
  assert.throws(() => validateRelease({ home, id: candidate.id, requireVerified: true }), /verification is not valid/);
  const verificationDigest = createHash('sha256').update(fs.readFileSync(verificationPath)).digest('hex');
  put(candidate.releasePath, '.release/activation.json', JSON.stringify({
    schemaVersion: 2, release: candidate.id, sourceDigest: candidate.manifest.sourceDigest,
    runtimeDigest: report.runtimeDigest, verificationDigest,
  }));
  assert.equal(validateRelease({ home, id: candidate.id, requireVerified: true }).id, candidate.id);
});

test('tampering with a verified candidate blocks activation before configuration changes', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = ready(t, home, source);
  put(home, settingsPath, '{"theme":"user-theme","foreign":42}\n');
  const before = fs.readFileSync(path.join(home, settingsPath), 'utf8');
  const activation = plan({ home, release: candidate.id });
  fs.appendFileSync(path.join(candidate.releasePath, 'packages/pi-web-fetch/index.ts'), '// tampered\n');

  assert.throws(() => execute(activation), /integrity mismatch|changed after checks/);
  assert.equal(fs.readFileSync(path.join(home, settingsPath), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(home, '.agents')), false);
});

test('failed candidate verification cannot alter active configuration', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = prepare(t, home, source);
  dependencies(home, candidate.id);
  const result = verifyRelease({
    home, id: candidate.id, apply: true,
    runChecks: check => ({ ok: !check.id.endsWith(':test'), reason: 'injected failure' }),
    runRuntimeChecks: () => runtimeSmoke(),
  });
  assert.equal(result.passed, false);
  assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release/development')), true);
  assert.throws(() => plan({ home, release: candidate.id }), /verification is not valid/);
  assert.equal(fs.existsSync(path.join(home, settingsPath)), false);
});

test('activation revalidates runtime and selected path before sealing or changing configuration', t => {
  for (const drift of ['runtime', 'path']) {
    const home = temporary(t);
    const source = fixture(t);
    const candidate = ready(t, home, source);
    const activation = plan({ home, release: candidate.id });
    if (drift === 'runtime') {
      put(candidate.releasePath, 'packages/pi-web-fetch/node_modules/fixture/package.json', '{"changed":true}\n');
    } else {
      activation.source = path.join(home, 'wrong-release');
    }
    assert.throws(() => execute(activation), /changed after (?:checks|dependency stage)|Selected release path changed/);
    assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release/activation.json')), false);
    assert.equal(fs.existsSync(path.join(home, settingsPath)), false);
    assert.equal(fs.existsSync(path.join(home, '.agents')), false);
  }
});

test('verified runtime is invalid when the exact Node version changes', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = ready(t, home, source);
  const reportPath = path.join(candidate.releasePath, '.release/verification.json');
  const report = readJSON(reportPath);
  report.runtime.node = 'v0.0.0-fixture';
  fs.writeFileSync(reportPath, JSON.stringify(report));
  assert.throws(() => validateRelease({ home, id: candidate.id, requireVerified: true }), /verification is not valid/);
});

test('unsealed verification is invalid when runner evidence is forged', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = ready(t, home, source);
  const reportPath = path.join(candidate.releasePath, '.release/verification.json');
  const report = readJSON(reportPath);
  report.runner.files['scripts/releases.mjs'] = fixtureHash;
  fs.writeFileSync(reportPath, JSON.stringify(report));
  assert.throws(() => validateRelease({ home, id: candidate.id, requireVerified: true }), /verification is not valid/);
});

test('active or settings-referenced releases are sealed against dependency and verification mutation', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = ready(t, home, source);
  const packagePath = path.join(candidate.releasePath, 'packages/pi-web-fetch').replaceAll('\\', '/');
  put(home, settingsPath, JSON.stringify({ packages: [packagePath] }));
  assert.throws(() => installReleaseDependencies({
    home, id: candidate.id, apply: true, runNpm: () => assert.fail('npm must not run'),
  }), /referenced by active settings/);

  fs.rmSync(path.join(home, settingsPath));
  execute(plan({ home, release: candidate.id }));
  assert.equal(readJSON(path.join(candidate.releasePath, '.release/activation.json')).schemaVersion, 2);
  assert.throws(() => installReleaseDependencies({
    home, id: candidate.id, apply: true, runNpm: () => assert.fail('npm must not run'),
  }), /sealed/);
  assert.throws(() => verifyRelease({
    home, id: candidate.id, runChecks: () => assert.fail('checks must not run'),
  }), /sealed/);
});

test('omitting --release after activation preserves the sealed active selection', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = ready(t, home, source);
  execute(plan({ home, release: candidate.id }));
  const doctorChecks = inspect({ home, spawn: () => ({ status: 0, stdout: 'pi 0.85.0\n', stderr: '' }) });
  assert.equal(doctorChecks.some(check => !check.ok), false);
  assert.ok(doctorChecks.some(check => check.message.includes(`Release ${candidate.id}`)));
  const wrongPi = inspect({ home, spawn: () => ({ status: 0, stdout: 'pi 10.85.0\n', stderr: '' }) })
    .find(check => check.message.startsWith('Pi expected'));
  assert.equal(wrongPi.ok, false);
  const ignoredCheckout = temporary(t, 'ignored-checkout-');

  const next = plan({ home, source: ignoredCheckout });
  assert.equal(next.release, candidate.id);
  assert.equal(next.source, candidate.releasePath);
  assert.deepEqual(next.operations, []);
  execute(next);
  const cli = spawnSync(process.execPath, [path.resolve('scripts/install.mjs'), '--home', home], {
    encoding: 'utf8', shell: false,
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /0 planned changes/);
});

test('activated release is independent of edited and relocated source checkouts', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = ready(t, home, source);
  execute(plan({ home, release: candidate.id }));
  const digest = validateRelease({ home, id: candidate.id, requireVerified: true }).manifest.sourceDigest;
  const settings = fs.readFileSync(path.join(home, settingsPath));

  for (const [name, repo] of Object.entries(source.repositories)) {
    put(repo, name === 'harness' ? 'agents/worker.md' : 'package.json', 'unusable checkout edit');
    const moved = `${repo}-moved`;
    fs.renameSync(repo, moved);
    t.after(() => fs.rmSync(moved, { recursive: true, force: true }));
    assert.equal(fs.existsSync(repo), false);
  }

  const next = plan({ home, source: source.repositories.harness });
  assert.equal(next.release, candidate.id);
  assert.equal(next.source, candidate.releasePath);
  assert.deepEqual(next.conflicts, []);
  assert.deepEqual(next.operations, []);
  assert.equal(validateRelease({ home, id: candidate.id, requireVerified: true }).manifest.sourceDigest, digest);
  assert.deepEqual(fs.readFileSync(path.join(home, settingsPath)), settings);
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/agents/worker.md'), 'utf8'), 'worker release A\n');
  for (const pkg of readJSON(path.join(candidate.releasePath, 'manifests/packages.json')).packages) {
    for (const extension of pkg.extensions) {
      assert.equal(fs.readFileSync(path.join(candidate.releasePath, pkg.path, extension), 'utf8'),
        `export const packageName = ${JSON.stringify(pkg.name)};\n`);
    }
  }
});

test('missing active state never falls back to checkout when settings still reference a release', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = ready(t, home, source);
  const packagePath = path.join(candidate.releasePath, 'packages/pi-web-fetch').replaceAll('\\', '/');
  put(home, settingsPath, JSON.stringify({ packages: [packagePath] }));

  assert.throws(() => plan({ home, source: source.repositories.harness }), /installer state has no active release; pass --release/);
  assert.equal(fs.existsSync(path.join(home, '.agents')), false);
});

test('explicit release selection migrates one legacy package entry while preserving its metadata', t => {
  const home = temporary(t);
  const source = fixture(t);
  const candidate = ready(t, home, source);
  put(home, settingsPath, JSON.stringify({ packages: [{ source: 'old/pi-interactive-subagents', enabled: false, custom: 7 }] }));

  const activation = plan({ home, release: candidate.id });
  assert.deepEqual(activation.conflicts, []);
  assert.deepEqual(activation.migrations.map(item => item.name), ['pi-interactive-subagents']);
  execute(activation);
  const entry = readJSON(path.join(home, settingsPath)).packages[0];
  assert.equal(entry.source, path.join(candidate.releasePath, 'packages/pi-interactive-subagents').replaceAll('\\', '/'));
  assert.equal(entry.enabled, false);
  assert.equal(entry.custom, 7);
});

test('selecting a previous compatible release rolls back managed package paths and values only', t => {
  const home = temporary(t);
  const source = fixture(t);
  const releaseA = ready(t, home, source);
  put(home, settingsPath, JSON.stringify({ theme: 'user-theme', foreign: 42, packages: [{ source: 'npm:unrelated', enabled: false }] }));
  put(home, '.agents/unrelated.txt', 'keep me\n');
  execute(plan({ home, release: releaseA.id }));

  put(source.repositories.harness, 'agents/worker.md', 'worker release B\n');
  put(source.repositories.harness, 'config/pi.settings.json', JSON.stringify({ theme: 'release-b', nested: { managed: false } }));
  source.commits.harness = commit(source.repositories.harness, 'harness B');
  const releaseB = ready(t, home, source);
  execute(plan({ home, release: releaseB.id }));
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/agents/worker.md'), 'utf8'), 'worker release B\n');

  const rollback = plan({ home, release: releaseA.id });
  assert.deepEqual(rollback.conflicts, []);
  execute(rollback);
  const settings = readJSON(path.join(home, settingsPath));
  assert.equal(settings.theme, 'release-theme');
  assert.equal(settings.foreign, 42);
  assert.deepEqual(settings.packages[0], { source: 'npm:unrelated', enabled: false });
  assert.ok(settings.packages.slice(1).every(entry => String(typeof entry === 'string' ? entry : entry.source).includes(releaseA.id)));
  assert.equal(fs.readFileSync(path.join(home, '.agents/unrelated.txt'), 'utf8'), 'keep me\n');
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/agents/worker.md'), 'utf8'), 'worker release A\n');
  const doctor = inspect({ home, release: releaseA.id, checkRuntime: false });
  assert.ok(doctor.every(item => item.ok), doctor.filter(item => !item.ok).map(item => item.message).join('\n'));
});

test('prompt-only release shape changes preserve unmanaged and edited destinations', t => {
  const home = temporary(t);
  const source = fixture(t);
  const releaseA = ready(t, home, source);
  execute(plan({ home, release: releaseA.id }));

  const relative = '.pi/agent/prompts/review.md';
  const content = '---\ndescription: Review changes\n---\nReview safely.\n';
  put(source.repositories.harness, 'prompts/review.md', content);
  source.commits.harness = commit(source.repositories.harness, 'add prompt template');
  const releaseB = ready(t, home, source);

  put(home, relative, 'user-owned prompt\n');
  const unmanaged = plan({ home, release: releaseB.id });
  assert.ok(unmanaged.conflicts.includes(relative));
  assert.throws(() => execute(unmanaged), /nothing written/);

  fs.rmSync(path.join(home, relative));
  const update = plan({ home, release: releaseB.id });
  assert.deepEqual(update.conflicts, []);
  execute(update);
  put(home, relative, 'edited managed prompt\n');
  const drift = plan({ home, release: releaseA.id });
  assert.ok(drift.conflicts.includes(relative));
  assert.throws(() => execute(drift), /nothing written/);

  put(home, relative, content);
  const rollback = plan({ home, release: releaseA.id });
  assert.deepEqual(rollback.conflicts, []);
  const backup = execute(rollback);
  assert.equal(fs.existsSync(path.join(home, relative)), false);
  assert.equal(fs.readFileSync(path.join(backup, relative), 'utf8'), content);
});

test('task workflow guide migration supports guarded update and backed-up rollback', t => {
  const home = temporary(t);
  const source = fixture(t);
  const releaseA = ready(t, home, source);
  execute(plan({ home, release: releaseA.id }));
  const relative = '.agents/guides/task-workflow.md';
  put(source.repositories.harness, 'guides/task-workflow.md', 'managed workflow\n');
  source.commits.harness = commit(source.repositories.harness, 'add task workflow guide');
  const releaseB = ready(t, home, source);
  put(home, relative, 'foreign workflow\n');
  const foreign = plan({ home, release: releaseB.id });
  assert.ok(foreign.conflicts.some(item => item.replaceAll('\\', '/') === relative));
  assert.throws(() => execute(foreign), /nothing written/);
  fs.rmSync(path.join(home, relative));
  const update = plan({ home, release: releaseB.id });
  assert.deepEqual(update.conflicts, []);
  execute(update);
  put(home, relative, 'user edit\n');
  const drift = plan({ home, release: releaseA.id });
  assert.ok(drift.conflicts.includes(relative));
  assert.throws(() => execute(drift), /nothing written/);
  put(home, relative, 'managed workflow\n');
  const rollback = plan({ home, release: releaseA.id });
  assert.deepEqual(rollback.conflicts, []);
  const backup = execute(rollback);
  assert.equal(fs.existsSync(path.join(home, relative)), false);
  assert.equal(fs.readFileSync(path.join(backup, relative), 'utf8'), 'managed workflow\n');
  assert.equal(Object.keys(readJSON(path.join(home, '.agent-config/state.json')).files)
    .some(key => key.replaceAll('\\', '/') === relative), false);
});

test('partial activation after an I/O error is detected and recoverable from its backups', t => {
  const home = temporary(t);
  const source = fixture(t);
  const releaseA = ready(t, home, source);
  put(home, settingsPath, JSON.stringify({ foreign: 42, packages: ['npm:unrelated'] }));
  put(home, '.agents/unrelated.txt', 'keep me\n');
  execute(plan({ home, release: releaseA.id }));

  put(source.repositories.harness, 'agents/worker.md', 'worker release B\n');
  source.commits.harness = commit(source.repositories.harness, 'harness B');
  const releaseB = ready(t, home, source);
  const activation = plan({ home, release: releaseB.id });
  const failedTarget = activation.operations.find(op => op.relative === settingsPath).target;
  const backupRoot = path.join(home, '.agent-config/backups');
  const previousBackups = new Set(fs.readdirSync(backupRoot));
  const originalWrite = fs.writeFileSync;
  const injected = t.mock.method(fs, 'writeFileSync', (target, ...args) => {
    if (target === failedTarget) throw Object.assign(new Error('injected disk write failure'), { code: 'EIO' });
    return originalWrite(target, ...args);
  });
  assert.throws(() => execute(activation), { code: 'EIO' });
  injected.mock.restore();

  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/agents/worker.md'), 'utf8'), 'worker release B\n');
  assert.equal(readJSON(path.join(home, '.agent-config/state.json')).release, releaseA.id);
  assert.equal(fs.existsSync(path.join(releaseB.releasePath, '.release/activation.json')), true);
  assert.ok(plan({ home }).conflicts.length > 0);
  const newBackups = fs.readdirSync(backupRoot).filter(name => !previousBackups.has(name));
  assert.equal(newBackups.length, 1);
  let restored = 0;
  for (const op of activation.operations) {
    const saved = path.join(backupRoot, newBackups[0], op.relative);
    if (!fs.existsSync(saved)) {
      assert.equal(fs.readFileSync(op.target, 'utf8'), op.before);
      continue;
    }
    const before = fs.readFileSync(saved, 'utf8');
    assert.equal(before, op.before);
    assert.ok([op.before, op.content].includes(fs.readFileSync(op.target, 'utf8')));
    fs.writeFileSync(op.target, before);
    restored++;
  }
  assert.equal(restored, 2);
  const recovered = plan({ home });
  assert.equal(recovered.release, releaseA.id);
  assert.deepEqual(recovered.conflicts, []);
  assert.deepEqual(recovered.operations, []);
  assert.equal(readJSON(path.join(home, settingsPath)).foreign, 42);
  assert.equal(fs.readFileSync(path.join(home, '.agents/unrelated.txt'), 'utf8'), 'keep me\n');
  assert.equal(validateRelease({ home, id: releaseB.id, requireVerified: true }).manifest.id, releaseB.id);
});

test('Orca skill retirement requires explicit opt-in, unchanged hashes, and creates backups', t => {
  const home = temporary(t);
  const source = fixture(t);
  const names = ['computer-use', 'orca-cli', 'orchestration'];
  for (const name of names) put(source.repositories.harness, `skills/${name}/SKILL.md`, `retire ${name}\n`);
  source.commits.harness = commit(source.repositories.harness, 'harness with Orca skills');
  const releaseA = ready(t, home, source);
  execute(plan({ home, release: releaseA.id }));

  for (const name of names) fs.rmSync(path.join(source.repositories.harness, 'skills', name), { recursive: true });
  source.commits.harness = commit(source.repositories.harness, 'retire Orca skills');
  const releaseB = ready(t, home, source);
  const blocked = plan({ home, release: releaseB.id });
  assert.ok(blocked.conflicts.some(item => item.includes('incompatible release rollback/update')));

  const changed = path.join(home, '.agents/skills/computer-use/SKILL.md');
  fs.writeFileSync(changed, 'user change\n');
  const divergent = plan({ home, release: releaseB.id, retireOrcaSkills: true });
  assert.ok(divergent.conflicts.includes('.agents/skills/computer-use/SKILL.md'));
  assert.throws(() => execute(divergent), /nothing written/);
  assert.equal(fs.existsSync(path.join(home, '.agents/skills/orca-cli/SKILL.md')), true);
  fs.writeFileSync(changed, 'retire computer-use\n');

  const retirement = plan({ home, release: releaseB.id, retireOrcaSkills: true });
  assert.deepEqual(retirement.conflicts, []);
  assert.deepEqual(retirement.operations.filter(op => op.content === null).map(op => op.relative).sort(),
    names.map(name => `.agents/skills/${name}/SKILL.md`).sort());
  const backup = execute(retirement);
  for (const name of names) {
    const relative = `.agents/skills/${name}/SKILL.md`;
    assert.equal(fs.existsSync(path.join(home, '.agents/skills', name)), false);
    assert.equal(fs.readFileSync(path.join(backup, relative), 'utf8'), `retire ${name}\n`);
    assert.equal(readJSON(path.join(home, '.agent-config/state.json')).files[relative], undefined);
  }
  assert.equal(fs.existsSync(path.join(home, '.agents/skills/example/SKILL.md')), true);

  assert.ok(plan({ home, release: releaseA.id }).conflicts.some(item => item.includes('incompatible release rollback/update')));
  const restore = plan({ home, release: releaseA.id, retireOrcaSkills: true });
  assert.deepEqual(restore.conflicts, []);
  execute(restore);
  for (const name of names) assert.equal(fs.readFileSync(path.join(home, `.agents/skills/${name}/SKILL.md`), 'utf8'), `retire ${name}\n`);
});

test('release switches with a different managed key or resource set are blocked', t => {
  const home = temporary(t);
  const source = fixture(t);
  const releaseA = ready(t, home, source);
  execute(plan({ home, release: releaseA.id }));
  put(source.repositories.harness, 'skills/new-skill/SKILL.md', '---\nname: new-skill\ndescription: new\n---\n');
  source.commits.harness = commit(source.repositories.harness, 'incompatible resources');
  const releaseB = ready(t, home, source);

  const next = plan({ home, release: releaseB.id, retireOrcaSkills: true });
  assert.ok(next.conflicts.some(item => item.includes('incompatible release rollback/update')));
  assert.throws(() => execute(next), /nothing written/);
  assert.equal(fs.existsSync(path.join(home, '.agents/skills/new-skill/SKILL.md')), false);
});

test('versioned bootstrap recipe pins the active release without local source paths', () => {
  const recipe = validateRecipe(readJSON(path.resolve('manifests/active-release.json')));
  assert.equal(spawnSync('git', ['cat-file', '-t', recipe.sources.harness], { encoding: 'utf8' }).stdout.trim(), 'commit');
  assert.deepEqual(recipe, {
    schemaVersion: 1,
    release: `h-${recipe.sources.harness.slice(0, 12)}-s-e955e29c51b7-m-c78b5148b110`,
    piVersion: '0.87.1',
    runtime: { node: 'v22.23.2' },
    sources: {
      harness: recipe.sources.harness,
      subagents: 'e955e29c51b7a6cce37e1108cd2d6c57a77e151c',
      memory: 'c78b5148b110ea5a42356ffedb7dc5cbdd2fafff',
    },
  });
});

function bootstrapRecipe(source) {
  const commits = source.commits;
  return validateRecipe({
    schemaVersion: 1,
    release: `h-${commits.harness.slice(0, 12)}-s-${commits.subagents.slice(0, 12)}-m-${commits.memory.slice(0, 12)}`,
    piVersion: '0.85.0',
    runtime: { node: process.version },
    sources: { ...commits },
  });
}
function bootstrapOptions(home, apply = false) {
  return { home, apply, withRtk: false, migratePackages: false, retireOrcaSkills: false };
}
function successfulPi(command) {
  return command === 'pi'
    ? { status: 0, stdout: 'pi 0.85.0\n', stderr: '' }
    : { status: 1, stdout: '', stderr: 'unexpected command' };
}
function bootstrapNpm(cwd) {
  put(cwd, 'node_modules/fixture/package.json', '{"name":"fixture"}\n');
  return { status: 0 };
}

test('bootstrap preview uses relative local source maps and writes nothing', t => {
  const home = temporary(t);
  const source = fixture(t);
  const mapRoot = temporary(t, 'bootstrap-map-');
  const map = path.join(mapRoot, 'sources.json');
  fs.writeFileSync(map, JSON.stringify(Object.fromEntries(Object.entries(source.repositories)
    .map(([key, value]) => [key, path.relative(mapRoot, value)]))));
  const repositories = readSourceMap(map);
  assert.deepEqual(repositories, Object.fromEntries(Object.entries(source.repositories).map(([key, value]) => [key, path.resolve(value)])));

  const result = runBootstrap({
    options: bootstrapOptions(home), recipe: bootstrapRecipe(source), repositories,
    reporter: { log() {} },
  });
  assert.equal(result.status, 'unprepared');
  assert.equal(result.written, false);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('bootstrap prepares, verifies, activates, then skips sealed stages when already active', t => {
  const home = temporary(t);
  const source = fixture(t);
  const recipe = bootstrapRecipe(source);
  put(home, settingsPath, JSON.stringify({ foreign: 42, packages: ['npm:unrelated@1.0.0'] }));
  let npmCalls = 0, checkCalls = 0, runtimeCalls = 0;
  const first = runBootstrap({
    options: bootstrapOptions(home, true), recipe, repositories: source.repositories,
    runNpm(cwd) { npmCalls++; return bootstrapNpm(cwd); },
    getNpmVersion: () => '11.6.2-fixture',
    runChecks() { checkCalls++; return { ok: true }; },
    runRuntimeChecks() { runtimeCalls++; return runtimeSmoke(); },
    doctorSpawn: successfulPi,
    reporter: { log() {} },
  });
  assert.equal(first.status, 'activated');
  assert.equal(readJSON(path.join(home, '.agent-config/state.json')).release, recipe.release);
  const installedSettings = readJSON(path.join(home, settingsPath));
  assert.equal(installedSettings.foreign, 42);
  assert.equal(installedSettings.packages[0], 'npm:unrelated@1.0.0');
  assert.equal(fs.existsSync(path.join(home, `.agent-config/releases/${recipe.release}/.release/activation.json`)), true);
  assert.deepEqual(plan({ home }).operations, []);
  assert.equal(npmCalls, 8);
  assert.equal(checkCalls, 10);
  assert.equal(runtimeCalls, 1);

  const again = runBootstrap({
    options: bootstrapOptions(home, true), recipe,
    runNpm: () => assert.fail('sealed active dependencies must not run'),
    runChecks: () => assert.fail('sealed active verification must not run'),
    runRuntimeChecks: () => assert.fail('sealed active runtime checks must not run'),
    doctorSpawn: successfulPi,
    reporter: { log() {} },
  });
  assert.equal(again.status, 'active');
  assert.equal(again.planned.operations.length, 0);
  assert.equal(again.written, false);
});

test('bootstrap activates an already verified candidate without recreating its development tree', t => {
  const home = temporary(t), source = fixture(t);
  const candidate = ready(t, home, source);
  assert.equal(fs.existsSync(path.join(candidate.releasePath, '.release/development')), false);
  const result = runBootstrap({
    options: bootstrapOptions(home, true), recipe: bootstrapRecipe(source),
    runNpm: () => assert.fail('verified candidate must not reinstall'),
    runChecks: () => assert.fail('verified candidate must not be retested'),
    doctorSpawn: successfulPi, reporter: { log() {} },
  });
  assert.equal(result.status, 'activated');
});

test('bootstrap verification failure leaves the previous active selection untouched', t => {
  const home = temporary(t);
  const source = fixture(t);
  const previous = ready(t, home, source);
  execute(plan({ home, release: previous.id }));
  const settingsBefore = fs.readFileSync(path.join(home, settingsPath));

  put(source.repositories.harness, 'agents/worker.md', 'candidate worker\n');
  source.commits.harness = commit(source.repositories.harness, 'candidate harness');
  const recipe = bootstrapRecipe(source);
  assert.throws(() => runBootstrap({
    options: bootstrapOptions(home, true), recipe, repositories: source.repositories,
    runNpm: bootstrapNpm,
    getNpmVersion: () => '11.6.2-fixture',
    runChecks: check => ({ ok: !check.id.endsWith(':test'), reason: 'injected failure' }),
    runRuntimeChecks: () => runtimeSmoke(),
    doctorSpawn: successfulPi,
    reporter: { log() {} },
  }), /Verification failed/);
  assert.equal(readJSON(path.join(home, '.agent-config/state.json')).release, previous.id);
  assert.deepEqual(fs.readFileSync(path.join(home, settingsPath)), settingsBefore);
  assert.equal(fs.existsSync(path.join(home, `.agent-config/releases/${recipe.release}/.release/activation.json`)), false);
});
