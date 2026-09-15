import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { execute, plan, readJSON } from '../scripts/install.mjs';
import {
  executeRelease,
  installReleaseDependencies,
  planRelease,
  verifyRelease,
} from '../scripts/releases.mjs';

function temporary(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function put(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function git(repository, args) {
  const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function repository(t, name) {
  const directory = temporary(t, `${name}-`);
  git(directory, ['init', '-q']);
  git(directory, ['config', 'user.name', 'Release Fixture']);
  git(directory, ['config', 'user.email', 'release@example.invalid']);
  git(directory, ['config', 'core.autocrlf', 'false']);
  return directory;
}

function commit(repository, message) {
  git(repository, ['add', '-A']);
  git(repository, ['commit', '-q', '-m', message]);
  return git(repository, ['rev-parse', 'HEAD']);
}

function packageFiles(repository, name, { memory = false, subagents = false } = {}) {
  const scripts = { typecheck: 'fixture', test: 'fixture' };
  if (subagents) Object.assign(scripts, { 'test:integration': 'fixture', 'test:smoke': 'fixture' });
  const extension = memory ? 'src/index.ts' : subagents ? 'pi-extension/subagents/index.ts' : 'index.ts';
  put(repository, 'package.json', JSON.stringify({
    name, version: '1.0.0', type: 'module', scripts, pi: { extensions: [`./${extension}`] },
  }));
  put(repository, 'package-lock.json', JSON.stringify({
    name, version: '1.0.0', lockfileVersion: 3, packages: { '': { name, version: '1.0.0' } },
  }));
  put(repository, 'tsconfig.json', '{}');
  put(repository, extension, 'export default function fixture() {}\n');
  put(repository, 'LICENSE', 'fixture license\n');
  put(repository, 'README.md', `# ${name}\n`);
  if (memory) put(repository, 'vitest.config.ts', 'export default {};\n');
}

function releaseSources(t, oldPolicy) {
  const harness = repository(t, 'installer-rollback-harness');
  put(harness, 'SYSTEM.md', 'fixture system\n');
  put(harness, 'agents/worker.md', 'fixture worker\n');
  put(harness, 'guides/git.md', 'fixture guide\n');
  put(harness, 'skills/example/SKILL.md', '---\nname: example\ndescription: fixture\n---\n');
  put(harness, 'config/pi.settings.json', JSON.stringify({ packages: [oldPolicy] }));
  put(harness, 'manifests/packages.json', JSON.stringify({
    piVersion: '0.85.0',
    packages: [{ name: 'pi-ask-user-question', path: 'vendor/pi-ask-user-question' }],
  }));
  packageFiles(path.join(harness, 'vendor/pi-ask-user-question'), 'pi-ask-user-question');
  put(harness, 'native/package.json', JSON.stringify({ name: 'native', version: '1.0.0' }));
  put(harness, 'native/package-lock.json', JSON.stringify({
    name: 'native', version: '1.0.0', lockfileVersion: 3,
    packages: { '': { name: 'native', version: '1.0.0' } },
  }));

  const subagents = repository(t, 'installer-rollback-subagents');
  packageFiles(subagents, 'pi-interactive-subagents', { subagents: true });
  const memory = repository(t, 'installer-rollback-memory');
  packageFiles(memory, 'observational-memory', { memory: true });

  return {
    repositories: { harness, subagents, memory },
    commits: {
      harness: commit(harness, 'old package policy'),
      subagents: commit(subagents, 'subagents fixture'),
      memory: commit(memory, 'memory fixture'),
    },
  };
}

const evidenceHash = 'a'.repeat(64);
const runtimeSmokeHash = createHash('sha256').update(
  fs.readFileSync(new URL('../scripts/runtime-smoke.mjs', import.meta.url)),
).digest('hex');
function prepareRelease(home, source) {
  const candidate = planRelease({ home, ...source });
  executeRelease(candidate);
  installReleaseDependencies({
    home, id: candidate.id, apply: true, getNpmVersion: () => '11.6.2-fixture',
    runNpm(directory) {
      fs.mkdirSync(path.join(directory, 'node_modules'), { recursive: true });
      return { status: 0 };
    },
  });
  const verification = verifyRelease({
    home, id: candidate.id, apply: true,
    runChecks: () => ({ ok: true }),
    runRuntimeChecks: () => ({
      host: {
        package: '@earendil-works/pi-coding-agent', version: '0.85.0',
        packageSha256: evidenceHash, executableSha256: evidenceHash, cliSha256: evidenceHash,
      },
      loader: {
        package: '@earendil-works/pi-coding-agent', version: '0.85.0', packageSha256: evidenceHash,
        loaderSha256: evidenceHash, mode: 'official-cli-rpc', entrypoint: 'dist/bundle/cli.js',
      },
      supplemental: { mode: 'mock-host-api-direct-tool-execution' },
      runner: { sha256: runtimeSmokeHash },
      results: [
        'runtime:host', 'runtime:loader', 'runtime:supplemental-tool-execution', 'runtime:process-only', 'runtime:rpc',
      ].map(id => ({ id, ok: true, durationMs: 0 })),
    }),
  });
  assert.equal(verification.passed, true, JSON.stringify(verification.runtimeChecks));
  return candidate;
}

const oldPolicy = { source: 'npm:bigpowers@2.88.6', extensions: [] };
const newPolicy = {
  ...oldPolicy,
  skills: [
    '.pi/skills/align-grid', '.pi/skills/context7-mcp', '.pi/skills/security-review',
    '.pi/skills/design-interface', '.pi/skills/deepen-architecture', '.pi/skills/elaborate-spec',
    '.pi/skills/grill-me', '.pi/skills/define-language', '.pi/skills/diagnose-root',
    '.pi/skills/enforce-first', '.pi/skills/edit-document', '.pi/skills/simple-english',
    '.pi/skills/smoke-test', '.pi/skills/validate-contracts',
  ],
  prompts: [],
};
const settingsPath = '.pi/agent/settings.json';

test('upgrade then rollback removes only unchanged prior-release package filters', t => {
  const home = temporary(t, 'installer-rollback-home-');
  const source = releaseSources(t, oldPolicy);
  const oldRelease = prepareRelease(home, source);
  execute(plan({ home, release: oldRelease.id }));

  put(source.repositories.harness, 'config/pi.settings.json', JSON.stringify({ packages: [newPolicy] }));
  source.commits.harness = commit(source.repositories.harness, 'add package filters');
  const newRelease = prepareRelease(home, source);
  execute(plan({ home, release: newRelease.id }));

  const upgraded = readJSON(path.join(home, settingsPath));
  const bigpowers = upgraded.packages.find(entry => entry.source?.startsWith('npm:bigpowers'));
  bigpowers.custom = { preserve: true };
  put(home, settingsPath, JSON.stringify(upgraded));

  const rollback = plan({ home, release: oldRelease.id });
  assert.deepEqual(rollback.conflicts, []);
  execute(rollback);
  assert.deepEqual(readJSON(path.join(home, settingsPath)).packages.find(
    entry => entry.source?.startsWith('npm:bigpowers'),
  ), { ...oldPolicy, custom: { preserve: true } });
  assert.deepEqual(plan({ home }).operations, []);

  execute(plan({ home, release: newRelease.id }));
  const customized = readJSON(path.join(home, settingsPath));
  customized.packages.find(entry => entry.source?.startsWith('npm:bigpowers')).skills = ['user/skill'];
  put(home, settingsPath, JSON.stringify(customized));
  const unsafeRollback = plan({ home, release: oldRelease.id });
  assert.ok(unsafeRollback.conflicts.some(conflict => /bigpowers.*skills/.test(conflict)));
  assert.throws(() => execute(unsafeRollback), /nothing written/);
  assert.deepEqual(readJSON(path.join(home, settingsPath)).packages.find(
    entry => entry.source?.startsWith('npm:bigpowers'),
  ).skills, ['user/skill']);
});
