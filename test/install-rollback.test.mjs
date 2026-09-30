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
const questionPaths = [
  'packages/pi-ask-user-question/index.ts',
  'packages/pi-ask-user-question/test/ask-user-question.test.mjs',
];

function questionRecovery(t) {
  const home = temporary(t, 'installer-question-recovery-home-');
  const previousHome = temporary(t, 'installer-question-pristine-home-');
  const backupPath = temporary(t, 'installer-question-backup-');
  const source = releaseSources(t, oldPolicy);
  put(source.repositories.harness, 'vendor/pi-ask-user-question/test/ask-user-question.test.mjs', 'original test\n');
  source.commits.harness = commit(source.repositories.harness, 'original question sources');
  const before = prepareRelease(home, source);
  execute(plan({ home, release: before.id }));
  fs.mkdirSync(path.join(previousHome, '.agent-config/releases'), { recursive: true });
  fs.cpSync(before.releasePath, path.join(previousHome, '.agent-config/releases', before.id), { recursive: true });
  const original = questionPaths.map(relative => fs.readFileSync(path.join(before.releasePath, relative)));
  put(source.repositories.harness, 'vendor/pi-ask-user-question/index.ts', 'export default function approvedHotfix() {}\n');
  put(source.repositories.harness, 'vendor/pi-ask-user-question/test/ask-user-question.test.mjs', 'approved hotfix test\n');
  source.commits.harness = commit(source.repositories.harness, 'approved question hotfix');
  const after = prepareRelease(home, source);
  for (const relative of questionPaths) {
    const content = fs.readFileSync(path.join(after.releasePath, relative));
    put(home, `.agent-config/releases/${before.id}/${relative}`, content);
    put(backupPath, relative, content);
  }
  const options = { home, release: after.id, recoverQuestionHotfix: { previousHome, backupPath } };
  return { home, previousHome, backupPath, before, after, original, options };
}

test('question hotfix recovery requires an independently verified pristine predecessor and exact backup', t => {
  const fixture = questionRecovery(t);
  const { home, previousHome, backupPath, before, after, original, options } = fixture;
  const state = path.join(home, '.agent-config/state.json');
  const stateBefore = fs.readFileSync(state);
  assert.throws(() => plan({ home, release: after.id }), /Release integrity mismatch/);
  assert.throws(() => plan({ home, release: before.id, recoverQuestionHotfix: options.recoverQuestionHotfix }), /recovery|switch/i);
  assert.throws(() => plan({ home, recoverQuestionHotfix: options.recoverQuestionHotfix }), /recovery|switch/i);
  const nestedPreviousHome = path.join(after.releasePath, '.release', 'pristine-home');
  fs.mkdirSync(path.join(nestedPreviousHome, '.agent-config/releases'), { recursive: true });
  fs.cpSync(path.join(previousHome, '.agent-config/releases', before.id),
    path.join(nestedPreviousHome, '.agent-config/releases', before.id), { recursive: true });
  assert.throws(() => plan({ ...options, recoverQuestionHotfix: { previousHome: nestedPreviousHome, backupPath } }), /separate/i);
  fs.rmSync(nestedPreviousHome, { recursive: true });
  const recovery = plan(options);
  assert.deepEqual(recovery.conflicts, []);
  assert.ok(recovery.recovery);
  assert.equal(fs.readFileSync(state).equals(stateBefore), true);

  const refuse = (location, relative, bytes) => {
    const target = path.join(location, relative);
    const beforeBytes = fs.existsSync(target) ? fs.readFileSync(target) : null;
    put(location, relative, bytes);
    try { assert.throws(() => plan(options)); assert.equal(fs.readFileSync(state).equals(stateBefore), true); }
    finally { if (beforeBytes === null) fs.rmSync(target); else fs.writeFileSync(target, beforeBytes); }
  };
  refuse(backupPath, questionPaths[0], 'different backup\n');
  fs.rmSync(path.join(backupPath, questionPaths[1]));
  assert.throws(() => plan(options));
  put(backupPath, questionPaths[1], fs.readFileSync(path.join(after.releasePath, questionPaths[1])));
  refuse(home, `.agent-config/releases/${before.id}/SYSTEM.md`, 'unrelated source change\n');
  refuse(home, `.agent-config/releases/${before.id}/packages/pi-ask-user-question/node_modules/extra.js`, 'extra runtime file\n');
  refuse(home, `.agent-config/releases/${before.id}/release.json`, '{}\n');
  refuse(previousHome, `.agent-config/releases/${before.id}/release.json`, '{}\n');
  refuse(previousHome, `.agent-config/releases/${before.id}/.release/dependencies.json`, '{}\n');
  assert.deepEqual(plan(options).conflicts, []);

  const stale = plan(options);
  put(home, `.agent-config/releases/${before.id}/${questionPaths[0]}`, 'changed after preview\n');
  assert.throws(() => execute(stale), /recover|changed|mismatch/i);
  assert.equal(fs.readFileSync(state).equals(stateBefore), true);
  put(home, `.agent-config/releases/${before.id}/${questionPaths[0]}`, fs.readFileSync(path.join(after.releasePath, questionPaths[0])));
  fs.writeFileSync(path.join(backupPath, questionPaths[0]), 'changed backup after preview\n');
  assert.throws(() => execute(stale), /recover|changed|mismatch/i);
  assert.equal(fs.readFileSync(state).equals(stateBefore), true);
  put(backupPath, questionPaths[0], fs.readFileSync(path.join(after.releasePath, questionPaths[0])));
  execute(stale);
  assert.equal(readJSON(state).release, after.id);
  for (let i = 0; i < questionPaths.length; i++) {
    assert.equal(fs.readFileSync(path.join(before.releasePath, questionPaths[i])).equals(original[i]), false);
    assert.equal(fs.readFileSync(path.join(backupPath, questionPaths[i])).equals(fs.readFileSync(path.join(before.releasePath, questionPaths[i]))), true);
  }
});

test('retired native packages are removed only when their managed registration is unchanged', t => {
  const home = temporary(t, 'installer-native-retirement-');
  const source = releaseSources(t, oldPolicy);
  const before = prepareRelease(home, source);
  execute(plan({ home, release: before.id }));
  const settings = readJSON(path.join(home, settingsPath));
  put(source.repositories.harness, 'config/pi.settings.json', JSON.stringify({ packages: [] }));
  source.commits.harness = commit(source.repositories.harness, 'retire native package');
  const after = prepareRelease(home, source);
  const modified = structuredClone(settings);
  modified.packages.find(entry => entry.source === oldPolicy.source).custom = true;
  put(home, settingsPath, JSON.stringify(modified));
  assert.ok(plan({ home, release: after.id }).conflicts.some(message => message.includes('retired managed package was modified')));
  put(home, settingsPath, JSON.stringify(settings));
  const migration = plan({ home, release: after.id });
  assert.deepEqual(migration.conflicts, []);
  execute(migration);
  assert.ok(!readJSON(path.join(home, settingsPath)).packages.some(entry => entry.source === oldPolicy.source));
});

test('Carbon resources, UI defaults, and task filtering upgrade and roll back together', t => {
  const home = temporary(t, 'installer-carbon-home-');
  const source = releaseSources(t, oldPolicy);
  const harness = source.repositories.harness;
  const tasksRoot = path.join(harness, 'vendor/pi-tasks');
  packageFiles(tasksRoot, '@tintinweb/pi-tasks');
  const taskMetadata = readJSON(path.join(tasksRoot, 'package.json'));
  taskMetadata.pi.extensions = ['./src/index.ts'];
  put(tasksRoot, 'package.json', JSON.stringify(taskMetadata));
  put(tasksRoot, 'src/index.ts', fs.readFileSync(path.join(tasksRoot, 'index.ts')));
  fs.rmSync(path.join(tasksRoot, 'index.ts'));
  source.commits.harness = commit(harness, 'legacy tasks baseline');

  const legacy = prepareRelease(home, source);
  const freshLegacy = plan({ home, release: legacy.id });
  assert.equal(freshLegacy.operations.some(op => op.relative.includes('carbon-')), false);
  execute(freshLegacy);
  let installed = readJSON(path.join(home, settingsPath));
  let tasks = installed.packages.find(entry => String(typeof entry === 'string' ? entry : entry.source).endsWith('/pi-tasks'));
  assert.equal(typeof tasks, 'string');
  assert.equal(Object.hasOwn(installed, 'editorPaddingX'), false);

  const carbonFiles = {
    'extensions/carbon-ui/index.ts': 'export default function carbonUi() {}\n',
    'extensions/carbon-ui/builtin-tools.ts': 'export const builtins = true;\n',
    'extensions/carbon-ui/tool-card.ts': 'export const toolCard = true;\n',
    'extensions/carbon-tasks/index.ts': 'export default function carbonTasks() {}\n',
    'themes/carbon-violet.json': '{"name":"carbon-violet","colors":{}}\n',
    'themes/carbon-graphite.json': '{"name":"carbon-graphite","colors":{}}\n',
  };
  for (const [relative, content] of Object.entries(carbonFiles)) put(harness, relative, content);
  put(harness, 'config/pi.settings.json', JSON.stringify({
    packages: [oldPolicy],
    theme: 'carbon-violet', editorPaddingX: 2, outputPad: 1,
    hideThinkingBlock: true, quietStartup: false, collapseChangelog: true,
  }));
  source.commits.harness = commit(harness, 'add portable Carbon resources');
  const carbon = prepareRelease(home, source);

  const upgrade = plan({ home, release: carbon.id });
  assert.deepEqual(upgrade.conflicts, []);
  for (const relative of Object.keys(carbonFiles)) {
    assert.ok(upgrade.operations.some(op => op.relative.replaceAll('\\', '/') === `.pi/agent/${relative}`));
  }
  execute(upgrade);
  installed = readJSON(path.join(home, settingsPath));
  tasks = installed.packages.find(entry => String(typeof entry === 'string' ? entry : entry.source).endsWith('/pi-tasks'));
  assert.deepEqual(tasks.extensions, []);
  assert.equal(installed.theme, 'carbon-violet');
  assert.equal(installed.editorPaddingX, 2);
  assert.equal(installed.outputPad, 1);
  assert.equal(installed.hideThinkingBlock, true);
  assert.equal(installed.quietStartup, false);
  assert.equal(installed.collapseChangelog, true);

  const rollback = plan({ home, release: legacy.id });
  assert.deepEqual(rollback.conflicts, []);
  assert.equal(rollback.operations.filter(op => op.content === null && op.relative.includes('carbon-')).length, 6);
  execute(rollback);
  installed = readJSON(path.join(home, settingsPath));
  tasks = installed.packages.find(entry => String(typeof entry === 'string' ? entry : entry.source).endsWith('/pi-tasks'));
  assert.equal(Object.hasOwn(tasks, 'extensions'), false);
  for (const key of ['theme', 'editorPaddingX', 'outputPad', 'hideThinkingBlock', 'quietStartup', 'collapseChangelog']) {
    assert.equal(Object.hasOwn(installed, key), false, key);
  }
  for (const relative of Object.keys(carbonFiles)) assert.equal(fs.existsSync(path.join(home, '.pi/agent', relative)), false);
  assert.deepEqual(plan({ home }).operations, []);

  execute(plan({ home, release: carbon.id }));
  installed = readJSON(path.join(home, settingsPath));
  installed.packages.find(entry => entry.source?.endsWith('/pi-tasks')).extensions = ['./src/index.ts'];
  put(home, settingsPath, JSON.stringify(installed));
  const unsafeRollback = plan({ home, release: legacy.id });
  assert.ok(unsafeRollback.conflicts.some(conflict => /pi-tasks\.extensions/.test(conflict)));
  assert.throws(() => execute(unsafeRollback), /nothing written/);
});

test('Carbon shape allowance does not permit the same settings without Carbon resources', t => {
  const home = temporary(t, 'installer-non-carbon-ui-home-');
  const source = releaseSources(t, oldPolicy);
  const previous = prepareRelease(home, source);
  execute(plan({ home, release: previous.id }));

  put(source.repositories.harness, 'config/pi.settings.json', JSON.stringify({
    packages: [oldPolicy], editorPaddingX: 2,
  }));
  source.commits.harness = commit(source.repositories.harness, 'unrelated UI shape change');
  const candidate = prepareRelease(home, source);
  const blocked = plan({ home, release: candidate.id });
  assert.ok(blocked.conflicts.some(conflict => conflict.includes('incompatible release rollback/update')));
  assert.throws(() => execute(blocked), /nothing written/);
});

test('compatibility artifacts adopt only catalogued predecessors and roll back unchanged resources', t => {
  const home = temporary(t, 'installer-compatibility-home-');
  const source = releaseSources(t, oldPolicy);
  const legacyRelease = prepareRelease(home, source);
  execute(plan({ home, release: legacyRelease.id }));

  const harness = source.repositories.harness;
  const predecessors = {
    '.pi/agent/HARNESS-AUTHORITY.md': '# Legacy authority\n',
    '.pi/agent/harness-manifest.json': '{"legacy":true}\n',
    '.pi/agent/scripts/verify-compatibility.mjs': 'console.log("legacy");\n',
  };
  const skill = '---\nname: fixture-curated\ndescription: fixture\n---\n';
  put(harness, 'pi-skills/fixture-curated/SKILL.md', skill);
  put(harness, 'manifests/curated-skills.json', JSON.stringify({
    schemaVersion: 1,
    source: { package: 'fixture', version: '1.0.0', repository: 'https://example.invalid', integrity: 'fixture', license: 'MIT' },
    skills: ['fixture-curated'],
    files: { 'fixture-curated/SKILL.md': createHash('sha256').update(skill).digest('hex') },
  }));
  put(harness, 'config/HARNESS-AUTHORITY.md', '# Current authority\n');
  for (const name of ['harness-compatibility.mjs', 'verify-compatibility.mjs']) {
    put(harness, `scripts/${name}`, fs.readFileSync(new URL(`../scripts/${name}`, import.meta.url)));
  }
  put(harness, 'manifests/harness-legacy.json', JSON.stringify({
    schemaVersion: 1,
    files: Object.fromEntries(Object.entries(predecessors).map(([relative, content]) =>
      [relative, [createHash('sha256').update(content).digest('hex')]])),
  }));
  source.commits.harness = commit(harness, 'add compatibility inventory');
  const compatible = prepareRelease(home, source);
  for (const [relative, content] of Object.entries(predecessors)) put(home, relative, content);

  const adoption = plan({ home, release: compatible.id });
  assert.deepEqual(adoption.conflicts, []);
  execute(adoption);
  assert.equal(readJSON(path.join(home, '.pi/agent/harness-manifest.json')).release.id, compatible.id);
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/HARNESS-AUTHORITY.md'), 'utf8'), '# Current authority\n');
  const state = readJSON(path.join(home, '.agent-config/state.json'));
  assert.equal(typeof state.files['.pi/agent/harness-manifest.json'], 'string');
  assert.equal(typeof state.files['.pi/agent/skills/fixture-curated/SKILL.md'], 'string');
  assert.deepEqual(plan({ home }).operations, []);

  const learningFiles = {
    'extensions/learning/index.ts': 'export default function learning() {}\n',
    'extensions/learning/store.mjs': 'export const learning = true;\n',
    'prompts/research.md': '---\ndescription: Research with sources\n---\nResearch $ARGUMENTS.\n',
  };
  for (const [relative, content] of Object.entries(learningFiles)) put(harness, relative, content);
  source.commits.harness = commit(harness, 'add reviewed learning and research prompt');
  const learning = prepareRelease(home, source);
  const learningUpgrade = plan({ home, release: learning.id });
  assert.deepEqual(learningUpgrade.conflicts, []);
  execute(learningUpgrade);
  put(home, '.pi/agent/learning/pending/private.json', '{"private":true}\n');
  put(home, '.pi/agent/skills/learned/learned-private/SKILL.md', 'user learning\n');
  const modifiedLearning = path.join(home, '.pi/agent/extensions/learning/store.mjs');
  fs.writeFileSync(modifiedLearning, 'user modification\n');
  assert.ok(plan({ home, release: compatible.id }).conflicts.includes('.pi/agent/extensions/learning/store.mjs'));
  fs.writeFileSync(modifiedLearning, learningFiles['extensions/learning/store.mjs']);
  execute(plan({ home, release: compatible.id }));
  for (const relative of Object.keys(learningFiles)) assert.equal(fs.existsSync(path.join(home, '.pi/agent', relative)), false);
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/learning/pending/private.json'), 'utf8'), '{"private":true}\n');
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/skills/learned/learned-private/SKILL.md'), 'utf8'), 'user learning\n');

  const unsafeHome = temporary(t, 'installer-compatibility-unsafe-');
  const unsafeCandidate = prepareRelease(unsafeHome, source);
  put(unsafeHome, '.pi/agent/HARNESS-AUTHORITY.md', '# User changed authority\n');
  const unsafe = plan({ home: unsafeHome, release: unsafeCandidate.id });
  assert.ok(unsafe.conflicts.includes('.pi/agent/HARNESS-AUTHORITY.md'));
  assert.throws(() => execute(unsafe), /nothing written/);
  assert.equal(fs.readFileSync(path.join(unsafeHome, '.pi/agent/HARNESS-AUTHORITY.md'), 'utf8'), '# User changed authority\n');

  const rollback = plan({ home, release: legacyRelease.id });
  assert.deepEqual(rollback.conflicts, []);
  execute(rollback);
  for (const relative of [
    '.pi/agent/HARNESS-AUTHORITY.md', '.pi/agent/harness-manifest.json',
    '.pi/agent/scripts/harness-compatibility.mjs', '.pi/agent/scripts/verify-compatibility.mjs',
    '.pi/agent/skills/fixture-curated/SKILL.md',
  ]) assert.equal(fs.existsSync(path.join(home, relative)), false, relative);
  assert.deepEqual(plan({ home }).operations, []);
});

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
