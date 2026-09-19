import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { args, plan, execute, readJSON, root } from '../scripts/install.mjs';
import { dependencyInstalled, inspect, runtimeDependencyNames } from '../scripts/doctor.mjs';

test('base profiles inherit instructions and disable nested delegation', () => {
  for (const name of ['general-purpose', 'Explore', 'Plan']) {
    const profile = fs.readFileSync(path.join(root, `agents/${name}.md`), 'utf8');
    assert.match(profile, /prompt_mode: append/);
    assert.match(profile, /allowed_subagents: none/);
    assert.doesNotMatch(profile, /subagent_agents:/);
    if (name === 'Plan') assert.match(profile, /extensions: false/);
  }
});

test('project prompt templates have discoverable metadata, contextual defaults, and bounded scope', () => {
  const prompts = Object.fromEntries(['review', 'diagnose', 'compare-designs', 'edit-document'].map(name =>
    [name, fs.readFileSync(path.join(root, 'prompts', `${name}.md`), 'utf8')]));
  for (const text of Object.values(prompts)) {
    assert.match(text, /^---\ndescription: .+\nargument-hint: .+\n---\n/);
    assert.match(text, /\$\{ARGUMENTS:-[^}]+\}/);
  }
  assert.match(prompts.review, /read-only/i);
  assert.match(prompts.review, /Do not report speculative risks/);
  assert.match(prompts.diagnose, /Reproduce.*isolate.*hypotheses.*verify/is);
  assert.match(prompts.diagnose, /Do not edit files or create mandatory diagnosis artifacts/);
  assert.match(prompts['compare-designs'], /two or three meaningfully different alternatives/);
  assert.match(prompts['compare-designs'], /Do not require subagents/);
  assert.match(prompts['compare-designs'], /Do not implement/);
  assert.match(prompts['edit-document'], /Preserve its intent, factual claims/);
  assert.match(prompts['edit-document'], /Do not.*impose arbitrary paragraph-length limits/is);
});

function sandbox(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}
function put(home, relative, text) {
  const target = path.join(home, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}
const settings = '.pi/agent/settings.json';
const rtkHook = '.pi/agent/extensions/rtk.ts';
const installScript = path.join(root, 'scripts/install.mjs');
const dependenciesScript = path.join(root, 'scripts/dependencies.mjs');
const instructionAdapter = home => [
  'Antes de empezar cualquier tarea, lee completamente con read:',
  path.join(home, '.agents/SYSTEM.md').replaceAll('\\', '/'),
  'Es la fuente compartida de instrucciones del usuario.',
].join('\n');
const legacyAppendBlock = home => [
  '<!-- agent-config:start -->',
  instructionAdapter(home),
  '<!-- agent-config:end -->',
].join('\n');
const legacyUnmarkedAdapter = home => [
  '# Instrucciones compartidas del usuario',
  '',
  'Antes de empezar cualquier tarea, lee completamente con la herramienta `read`:',
  '',
  `\`${path.join(home, '.agents/SYSTEM.md')}\``,
  '',
  'Trátalo como las instrucciones globales del usuario. Después lee las guías y las',
  'instrucciones del repositorio que ese fichero indique. No dupliques aquí sus reglas ni',
  'modifiques `SYSTEM.md` salvo petición explícita del usuario.',
].join('\n');

function assertLegacyDoctorOnlyNeedsRelease(checks) {
  assert.deepEqual(checks.filter(item => !item.ok).map(item => item.message), [
    'Verified release selection: missing; installation requires an explicit verified release',
  ]);
}

test('legacy planner dry run does not write anything', t => {
  const home = sandbox(t);
  assert.ok(plan({ home }).operations.length > 5);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('installation CLI rejects a new home without a verified release and preserves legacy recovery settings', t => {
  for (const apply of [false, true]) {
    for (const existingSettings of [undefined, {
      packages: [
        path.join(root, 'vendor/pi-interactive-subagents').replaceAll('\\', '/'),
        path.join(root, 'vendor/observational-memory').replaceAll('\\', '/'),
      ],
      recovery: true,
    }]) {
      const home = sandbox(t);
      if (existingSettings) put(home, settings, JSON.stringify(existingSettings));
      const before = existingSettings ? fs.readFileSync(path.join(home, settings), 'utf8') : undefined;
      const result = spawnSync(process.execPath, [installScript, '--home', home, ...(apply ? ['--apply'] : [])], {
        encoding: 'utf8', shell: false,
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /verified release is required/i);
      if (before === undefined) assert.deepEqual(fs.readdirSync(home), []);
      else assert.equal(fs.readFileSync(path.join(home, settings), 'utf8'), before);
    }
  }
});

test('local dependency preview covers only harness-owned packages', () => {
  const result = spawnSync(process.execPath, [dependenciesScript], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Local harness packages only/);
  assert.match(result.stdout, /vendor[\\/]pi-ask-user-question/);
  assert.match(result.stdout, /vendor[\\/]pi-browser/);
  assert.doesNotMatch(result.stdout, /vendor[\\/]pi-(?:mcp|web-fetch)/);
  assert.doesNotMatch(result.stdout, /pi-interactive-subagents|observational-memory/);
});
test('RTK cannot be re-enabled and preview writes nothing', t => {
  const home = sandbox(t);
  assert.throws(() => plan({ home, withRtk: true }), /retired/);
  assert.throws(() => args(['--with-rtk']), /retired/);
  assert.deepEqual(fs.readdirSync(home), []);
});
test('fresh plan derives package paths from a relocated source', t => {
  const home = sandbox(t), source = sandbox(t);
  for (const entry of ['SYSTEM.md', 'guides', 'skills', 'agents', 'config', 'manifests']) {
    fs.cpSync(path.join(root, entry), path.join(source, entry), { recursive: true });
  }
  const result = plan({ home, source });
  const operation = result.operations.find(item => item.relative === settings);
  const manifest = readJSON(path.join(source, 'manifests/packages.json'));
  const expected = manifest.packages.map(pkg => path.resolve(source, pkg.path).replaceAll('\\', '/'));
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(JSON.parse(operation.content).packages, [...expected, ...readJSON(path.join(source, 'config/pi.settings.json')).packages]);
});

test('legacy planner fixture is idempotent and preserves profiles and source', t => {
  const home = sandbox(t);
  execute(plan({ home }));
  assert.deepEqual(plan({ home }).operations, []);
  assert.deepEqual(plan({ home }).conflicts, []);
  const installedSettings = readJSON(path.join(home, settings));
  assert.equal(installedSettings.defaultThinkingLevel, 'medium');
  assert.deepEqual(installedSettings.compaction, { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 });
  assert.equal(installedSettings['observational-memory'].compactAtContextTokens, 150000);
  assert.equal(installedSettings['observational-memory'].tailTokens, 20000);
  assert.equal(installedSettings.theme, 'carbon-violet');
  assert.equal(installedSettings.editorPaddingX, 2);
  assert.equal(installedSettings.outputPad, 1);
  assert.equal(installedSettings.hideThinkingBlock, true);
  assert.equal(installedSettings.quietStartup, false);
  assert.equal(installedSettings.collapseChangelog, true);
  assert.deepEqual(installedSettings.packages.find(entry => entry.source?.endsWith('/pi-tasks')).extensions, []);
  for (const relative of [
    'extensions/carbon-ui/index.ts', 'extensions/carbon-ui/builtin-tools.ts',
    'extensions/carbon-ui/tool-card.ts', 'extensions/carbon-tasks/index.ts', 'themes/carbon-violet.json',
  ]) {
    assert.equal(fs.readFileSync(path.join(home, '.pi/agent', relative), 'utf8'), fs.readFileSync(path.join(root, relative), 'utf8'));
  }
  const generalPurpose = fs.readFileSync(path.join(home, '.pi/agent/agents/general-purpose.md'), 'utf8');
  const explore = fs.readFileSync(path.join(home, '.pi/agent/agents/Explore.md'), 'utf8');
  assert.match(generalPurpose, /prompt_mode: append/);
  assert.match(generalPurpose, /thinking: medium/);
  assert.match(explore, /thinking: medium/);
  assert.equal(fs.readFileSync(path.join(home, '.agents/SYSTEM.md'), 'utf8'), fs.readFileSync(path.join(root, 'SYSTEM.md'), 'utf8'));
  assert.ok(!installedSettings.packages.some(entry => (typeof entry === 'string' ? entry : entry.source).startsWith('npm:bigpowers')));
  for (const skill of ['pdf-reader', 'youtube-transcript', 'analyze-sessions']) {
    assert.equal(fs.existsSync(path.join(home, '.agents/skills', skill, 'SKILL.md')), true);
  }
  for (const prompt of ['review', 'diagnose', 'compare-designs', 'edit-document']) {
    const installed = path.join(home, '.pi/agent/prompts', `${prompt}.md`);
    assert.equal(fs.readFileSync(installed, 'utf8'), fs.readFileSync(path.join(root, 'prompts', `${prompt}.md`), 'utf8'));
  }
  assert.equal(fs.existsSync(path.join(home, '.agents/skills/pdf-reader/scripts/pdf_reader.py')), true);
  assert.equal(fs.existsSync(path.join(home, '.agents/skills/youtube-transcript/scripts/youtube_transcript.py')), true);
  assert.equal(fs.existsSync(path.join(home, '.agents/skills/analyze-sessions/scripts/analyze-sessions.mjs')), true);
  const taskGuide = fs.readFileSync(path.join(home, '.agents/guides/task-workflow.md'), 'utf8');
  assert.match(taskGuide, /varias etapas, usa las tareas del harness/);
  assert.match(taskGuide, /workflow sólo cuando el usuario lo pida explícitamente/);
  assert.match(taskGuide, /supervisor.*sólo\ncuando el usuario autorice explícitamente/);
  assertLegacyDoctorOnlyNeedsRelease(inspect({ home, checkRuntime: false }));
});
test('generated skill environments and Python caches are never projected', t => {
  const home = sandbox(t), source = sandbox(t);
  for (const entry of ['SYSTEM.md', 'guides', 'skills', 'agents', 'config', 'manifests']) {
    fs.cpSync(path.join(root, entry), path.join(source, entry), { recursive: true });
  }
  put(source, 'skills/pdf-reader/.venv/private.bin', 'generated');
  put(source, 'skills/pdf-reader/scripts/__pycache__/cached.pyc', 'generated');
  put(source, 'skills/pdf-reader/scripts/loose.pyc', 'generated');
  const result = plan({ home, source });
  assert.equal(result.operations.some(item => /\.venv|__pycache__|\.pyc$/.test(item.relative)), false);
});
test('legacy package, profiles and RTK require explicit migration and are backed up', t => {
  const home = sandbox(t);
  put(home, rtkHook, 'legacy hook');
  put(home, '.pi/agent/agents/worker.md', 'legacy worker');
  put(home, settings, JSON.stringify({ packages: ['git:github.com/igalarey/pi-interactive-subagents', 'npm:unrelated@1'] }));
  assert.throws(() => execute(plan({ home })), /nothing written/);
  const migration = plan({ home, migrateBase: true });
  const backup = execute(migration);
  assert.equal(fs.existsSync(path.join(home, rtkHook)), false);
  assert.equal(fs.existsSync(path.join(home, '.pi/agent/agents/worker.md')), false);
  assert.equal(fs.readFileSync(path.join(backup, rtkHook), 'utf8'), 'legacy hook');
  assert.equal(fs.readFileSync(path.join(backup, '.pi/agent/agents/worker.md'), 'utf8'), 'legacy worker');
  assert.equal(readJSON(path.join(home, settings)).packages[0], 'npm:unrelated@1');
  assert.deepEqual(plan({ home }).operations, []);
});
test('applies managed defaults while preserving unrelated settings, APPEND prompt, and AGENTS content', t => {
  const home = sandbox(t);
  const original = '{"theme":"custom","foreign":"preserve","defaultThinkingLevel":"low","packages":["npm:unrelated@1.0.0"],"observational-memory":{"custom":42}}';
  const originalAppend = 'User append instructions\n';
  const originalAgents = '# User global context\n\nKeep this instruction.\n';
  put(home, settings, original);
  put(home, '.pi/agent/APPEND_SYSTEM.md', originalAppend);
  put(home, '.pi/agent/AGENTS.md', originalAgents);
  const backup = execute(plan({ home }));
  const next = readJSON(path.join(home, settings));
  assert.equal(next.theme, 'carbon-violet');
  assert.equal(next.foreign, 'preserve');
  assert.equal(next['observational-memory'].custom, 42);
  assert.equal(next.packages[0], 'npm:unrelated@1.0.0');
  assert.equal(fs.readFileSync(path.join(backup, settings), 'utf8'), original);
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/APPEND_SYSTEM.md'), 'utf8'), originalAppend);
  const agents = fs.readFileSync(path.join(home, '.pi/agent/AGENTS.md'), 'utf8');
  assert.ok(agents.startsWith(originalAgents));
  assert.match(agents, /<!-- agent-config:shared-instructions:start -->/);
  assert.match(agents, new RegExp(instructionAdapter(home).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(fs.readFileSync(path.join(backup, '.pi/agent/AGENTS.md'), 'utf8'), originalAgents);
  assert.equal(plan({ home }).operations.length, 0);
});

test('migrates the exact managed APPEND block to AGENTS and preserves unrelated APPEND content', t => {
  const home = sandbox(t);
  const original = `User before\n${legacyAppendBlock(home)}\nUser after\n`;
  put(home, '.pi/agent/APPEND_SYSTEM.md', original);
  const migration = plan({ home });
  assert.deepEqual(migration.conflicts, []);
  const backup = execute(migration);
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/APPEND_SYSTEM.md'), 'utf8'), 'User before\n\nUser after\n');
  assert.equal(fs.readFileSync(path.join(backup, '.pi/agent/APPEND_SYSTEM.md'), 'utf8'), original);
  assert.match(fs.readFileSync(path.join(home, '.pi/agent/AGENTS.md'), 'utf8'), /agent-config:shared-instructions:start/);
  assert.deepEqual(plan({ home }).operations, []);
});

test('retires the exact full unmarked legacy adapter plus managed block and removes the empty APPEND file with backup', t => {
  const home = sandbox(t);
  const original = `${legacyUnmarkedAdapter(home)}\n${legacyAppendBlock(home)}\n`;
  put(home, '.pi/agent/APPEND_SYSTEM.md', original);
  const backup = execute(plan({ home }));
  assert.equal(fs.existsSync(path.join(home, '.pi/agent/APPEND_SYSTEM.md')), false);
  assert.equal(fs.readFileSync(path.join(backup, '.pi/agent/APPEND_SYSTEM.md'), 'utf8'), original);
  assert.deepEqual(plan({ home }).operations, []);
});

test('preserves adapterBody embedded in foreign APPEND prose and code examples', t => {
  const home = sandbox(t);
  const original = `Foreign documentation:\n\n\`\`\`text\n${instructionAdapter(home)}\n\`\`\`\n\nDo not rewrite this example.\n`;
  put(home, '.pi/agent/APPEND_SYSTEM.md', original);
  execute(plan({ home }));
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/APPEND_SYSTEM.md'), 'utf8'), original);
  assert.deepEqual(plan({ home }).operations, []);
});

test('preserves the full unmarked legacy template embedded in foreign fenced documentation', t => {
  const home = sandbox(t);
  const original = `Example only:\n\n\`\`\`markdown\n${legacyUnmarkedAdapter(home)}\n\`\`\`\n`;
  put(home, '.pi/agent/APPEND_SYSTEM.md', original);
  execute(plan({ home }));
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/APPEND_SYSTEM.md'), 'utf8'), original);
});

test('preserves a quoted or modified full legacy-shaped APPEND template', t => {
  const home = sandbox(t);
  const quoted = legacyUnmarkedAdapter(home).split('\n').map(line => `> ${line}`).join('\n');
  const original = `${quoted.replace('instrucciones globales', 'preferencias globales')}\n`;
  put(home, '.pi/agent/APPEND_SYSTEM.md', original);
  execute(plan({ home }));
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/APPEND_SYSTEM.md'), 'utf8'), original);
});
test('existing shared SYSTEM is preserved rather than silently replaced', t => {
  const home = sandbox(t);
  put(home, '.agents/SYSTEM.md', 'user-owned');
  const result = plan({ home });
  assert.deepEqual(result.conflicts, []);
  execute(result);
  assert.equal(fs.existsSync(path.join(home, settings)), true);
  assert.equal(fs.readFileSync(path.join(home, '.agents/SYSTEM.md'), 'utf8'), 'user-owned');
});

test('modified managed files conflict on reinstall', t => {
  const home = sandbox(t);
  execute(plan({ home }));
  put(home, '.pi/agent/agents/general-purpose.md', 'local changes');
  assert.ok(plan({ home }).conflicts.length > 0);
});
test('unmanaged prompt templates conflict instead of being overwritten', t => {
  const home = sandbox(t);
  put(home, '.pi/agent/prompts/review.md', 'user-owned prompt\n');
  const result = plan({ home });
  assert.ok(result.conflicts.includes('.pi/agent/prompts/review.md'));
  assert.throws(() => execute(result), /nothing written/);
  assert.equal(fs.readFileSync(path.join(home, '.pi/agent/prompts/review.md'), 'utf8'), 'user-owned prompt\n');
});
test('a new source version updates tracked files and backs them up', t => {
  const home = sandbox(t);
  execute(plan({ home }));
  const source = sandbox(t);
  for (const entry of ['SYSTEM.md', 'guides', 'skills', 'agents', 'config', 'manifests']) {
    fs.cpSync(path.join(root, entry), path.join(source, entry), { recursive: true });
  }
  const manifest = readJSON(path.join(source, 'manifests/packages.json'));
  for (const pkg of manifest.packages) pkg.path = path.join(root, pkg.path);
  fs.writeFileSync(path.join(source, 'manifests/packages.json'), JSON.stringify(manifest));
  fs.appendFileSync(path.join(source, 'agents/general-purpose.md'), '\nUpdated source\n');
  const result = plan({ home, source });
  assert.equal(result.conflicts.length, 0);
  execute(result);
  assert.match(fs.readFileSync(path.join(home, '.pi/agent/agents/general-purpose.md'), 'utf8'), /Updated source/);
  assert.equal(plan({ home, source }).operations.length, 0);
});
test('malformed settings and incorrect package types fail without writes', t => {
  const home = sandbox(t);
  for (const text of ['{broken', '[]', '{"packages":{}}']) {
    put(home, settings, text);
    assert.throws(() => plan({ home }));
    assert.equal(fs.existsSync(path.join(home, '.agents')), false);
  }
});
test('existing local harness package path requires and supports explicit legacy migration', t => {
  const home = sandbox(t);
  const original = JSON.stringify({ packages: ['packages\\pi-browser'] });
  put(home, settings, original);
  const blocked = plan({ home });
  assert.ok(blocked.conflicts.some(value => value.includes('package already configured')));
  assert.throws(() => execute(blocked));
  const migration = plan({ home, migratePackages: true });
  assert.deepEqual(migration.conflicts, []);
  assert.deepEqual(migration.migrations.map(item => item.name), ['pi-browser']);
  const previewChecks = inspect({ home, migratePackages: true, checkRuntime: false });
  assert.equal(previewChecks.find(item => item.message.startsWith('Conflicts:'))?.ok, true);
  const backup = execute(migration);
  const sources = readJSON(path.join(home, settings)).packages;
  assert.equal(sources[0], path.resolve(root, 'vendor/pi-browser').replaceAll('\\', '/'));
  assert.equal(fs.readFileSync(path.join(backup, settings), 'utf8'), original);
  assert.deepEqual(plan({ home }).conflicts, []);
});
test('local harness package migration preserves object metadata', t => {
  const home = sandbox(t);
  put(home, settings, JSON.stringify({ packages: [{ source: 'packages\\pi-ask-user-question', enabled: false, custom: 42 }] }));
  execute(plan({ home, migratePackages: true }));
  const entry = readJSON(path.join(home, settings)).packages.find(value => typeof value === 'object');
  assert.equal(entry.source, path.resolve(root, 'vendor/pi-ask-user-question').replaceAll('\\', '/'));
  assert.equal(entry.enabled, false);
  assert.equal(entry.custom, 42);
});
test('Git repository aliases migrate without duplicating memory or scoped tintinweb packages', t => {
  const home = sandbox(t), source = sandbox(t);
  for (const entry of ['SYSTEM.md', 'guides', 'skills', 'agents', 'config', 'manifests']) {
    fs.cpSync(path.join(root, entry), path.join(source, entry), { recursive: true });
  }
  const packages = ['observational-memory', '@tintinweb/pi-subagents'].map(name => ({ name, path: `packages/${name}` }));
  put(source, 'manifests/packages.json', JSON.stringify({ packages }));
  put(home, settings, JSON.stringify({ packages: ['git:github.com/igalarey/pi-observational-memory',
    { source: 'git:github.com/tintinweb/pi-subagents@abc', skills: [] }] }));
  execute(plan({ home, source, migratePackages: true }));
  const actual = readJSON(path.join(home, settings)).packages;
  assert.equal(actual.length, 2 + readJSON(path.join(source, 'config/pi.settings.json')).packages.length);
  assert.equal(actual[0], path.join(source, packages[0].path).split(path.sep).join('/'));
  assert.equal(actual[1].source, path.join(source, packages[1].path).split(path.sep).join('/'));
  assert.deepEqual(actual[1].skills, []);
});

test('ambiguous local harness package entries cannot be migrated', t => {
  const home = sandbox(t);
  put(home, settings, JSON.stringify({ packages: ['old/pi-browser', 'older/pi-browser'] }));
  const result = plan({ home, migratePackages: true });
  assert.ok(result.conflicts.includes('package configured multiple times: pi-browser'));
  assert.deepEqual(result.migrations, []);
  assert.throws(() => execute(result), /nothing written/);
});
test('changed destination between plan and apply is refused', t => {
  const home = sandbox(t);
  const result = plan({ home });
  put(home, settings, '{"theme":"new"}');
  assert.throws(() => execute(result), /changed since preview/);
  assert.equal(fs.existsSync(path.join(home, '.agents')), false);
});
test('ambiguous or modified managed instruction blocks conflict without writes', t => {
  const cases = [
    ['.pi/agent/APPEND_SYSTEM.md', '<!-- agent-config:start -->'],
    ['.pi/agent/APPEND_SYSTEM.md', '<!-- agent-config:start -->\nmodified\n<!-- agent-config:end -->'],
    ['.pi/agent/AGENTS.md', '<!-- agent-config:shared-instructions:start -->'],
    ['.pi/agent/AGENTS.md', '<!-- agent-config:shared-instructions:start -->\nmodified\n<!-- agent-config:shared-instructions:end -->'],
  ];
  for (const [relative, content] of cases) {
    const home = sandbox(t);
    put(home, relative, content);
    const result = plan({ home });
    assert.ok(result.conflicts.some(value => value.includes(relative)));
    assert.throws(() => execute(result), /nothing written/);
    assert.equal(fs.readFileSync(path.join(home, relative), 'utf8'), content);
    assert.equal(fs.existsSync(path.join(home, settings)), false);
  }
});

test('global context precedence conflicts prevent an adapter hidden by override or shadowing CLAUDE', t => {
  for (const relative of ['.pi/agent/AGENTS.override.md', '.pi/agent/CLAUDE.md', '.pi/agent/CLAUDE.MD']) {
    const home = sandbox(t);
    put(home, relative, 'user-owned global context\n');
    const result = plan({ home });
    assert.ok(result.conflicts.some(value => value.includes(relative)), `missing conflict for ${relative}`);
    assert.throws(() => execute(result), /nothing written/);
    assert.equal(fs.readdirSync(path.join(home, '.pi/agent')).includes('AGENTS.md'), false);
    assert.equal(fs.readFileSync(path.join(home, relative), 'utf8'), 'user-owned global context\n');
  }
});

test('case-insensitive global override still conflicts on Windows', { skip: process.platform !== 'win32' }, t => {
  const home = sandbox(t);
  put(home, '.pi/agent/AgEnTs.OvErRiDe.Md', 'user-owned mixed-case override\n');
  const result = plan({ home });
  assert.ok(result.conflicts.some(value => value.includes('AgEnTs.OvErRiDe.Md')));
  assert.throws(() => execute(result), /nothing written/);
  assert.deepEqual(fs.readdirSync(path.join(home, '.pi/agent')), ['AgEnTs.OvErRiDe.Md']);
});

test('preserves and augments an existing AGENTS.MD without creating a shadowing AGENTS.md', t => {
  const home = sandbox(t);
  const original = '# Existing uppercase context\n';
  put(home, '.pi/agent/AGENTS.MD', original);
  const backup = execute(plan({ home }));
  const names = fs.readdirSync(path.join(home, '.pi/agent'));
  assert.equal(names.includes('AGENTS.md'), false);
  assert.equal(names.includes('AGENTS.MD'), true);
  const content = fs.readFileSync(path.join(home, '.pi/agent/AGENTS.MD'), 'utf8');
  assert.ok(content.startsWith(original));
  assert.match(content, /agent-config:shared-instructions:start/);
  assert.equal(fs.readFileSync(path.join(backup, '.pi/agent/AGENTS.MD'), 'utf8'), original);
  assert.deepEqual(plan({ home }).operations, []);
});
test('destination symlinks or junctions are not followed', t => {
  const home = sandbox(t), elsewhere = sandbox(t);
  fs.symlinkSync(elsewhere, path.join(home, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => plan({ home }), /symlink destination/);
  assert.deepEqual(fs.readdirSync(elsewhere), []);
});
test('broken destination junctions are refused too', t => {
  const home = sandbox(t), elsewhere = sandbox(t);
  const missing = path.join(elsewhere, 'missing');
  fs.symlinkSync(missing, path.join(home, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => plan({ home }), /symlink destination/);
  assert.equal(fs.existsSync(missing), false);
});
test('implementation profile grants only explicit local tools', () => {
  const profile = fs.readFileSync(path.join(root, 'agents/general-purpose.md'), 'utf8');
  assert.match(profile, /tools: read, grep, find, ls, bash, edit, write\n/);
  assert.doesNotMatch(profile, /ext:|tools: "\*"/);
  assert.match(profile, /extensions: \["~\/\.pi\/agent\/agents\/luna-fast\.mjs"\]/);
});

test('retired Orca skills are absent while find-skills remains independent', () => {
  for (const name of ['computer-use', 'orca-cli', 'orchestration']) {
    assert.equal(fs.existsSync(path.join(root, 'skills', name)), false);
  }
  const skill = fs.readFileSync(path.join(root, 'skills/find-skills/SKILL.md'), 'utf8');
  assert.match(skill, /skills\.sh/);
  assert.match(skill, /npx skills/);
  assert.doesNotMatch(skill, /Orca/i);
});

test('memory roles use the selected Codex Luna model and high reasoning', () => {
  const settings = readJSON(path.join(root, 'config/pi.settings.json'));
  const expected = { provider: 'openai-codex', id: 'gpt-5.6-luna', thinking: 'high' };
  assert.deepEqual(settings['observational-memory'].models.observer, expected);
  assert.deepEqual(settings['observational-memory'].models.consolidator, expected);
});

test('local manifest contains only harness-owned packages', () => {
  const manifest = readJSON(path.join(root, 'manifests/packages.json'));
  assert.equal(manifest.scope, 'local-harness');
  assert.equal(manifest.piVersion, '0.85.1');
  assert.deepEqual(manifest.packages.map(pkg => pkg.name), ['pi-ask-user-question', 'pi-browser', 'pi-subscription-usage', '@tintinweb/pi-tasks', 'pi-supervisor']);
  const usageMeta = readJSON(path.join(root, 'vendor/pi-subscription-usage/package.json'));
  for (const name of ['pi-ai', 'pi-coding-agent', 'pi-tui']) {
    assert.equal(usageMeta.peerDependencies[`@earendil-works/${name}`], '0.85.1');
  }
  assert.equal(manifest.packages.find(pkg => pkg.name === 'pi-browser')?.version, '0.2.0');
  assert.doesNotMatch(JSON.stringify(manifest.packages), /pi-interactive-subagents|observational-memory/);
});
test('local Pi 0.85.1 tools are pinned and exclude reviewed unlicensed source paths', () => {
  const askFolder = path.join(root, 'vendor/pi-ask-user-question');
  for (const name of ['pi-ask-user-question', 'pi-browser']) {
    const metadata = readJSON(path.join(root, 'vendor', name, 'package.json'));
    assert.equal(metadata.peerDependencies['@earendil-works/pi-coding-agent'], '0.85.1');
    assert.equal(metadata.peerDependencies.typebox, '1.3.7');
    assert.equal(metadata.dependencies?.['@earendil-works/pi-server'], undefined);
    assert.equal(metadata.devDependencies?.['@earendil-works/pi-server'], undefined);
  }
  const source = fs.readFileSync(path.join(askFolder, 'index.ts'), 'utf8');
  assert.doesNotMatch(source, /@mariozechner\/|@sinclair\/|r\.jina\.ai/);
  assert.match(source, /ask_user_question/);
});
test('doctor reduced runtime checks production dependencies without requiring peers or dev dependencies', () => {
  const meta = {
    dependencies: { runtime: '1.0.0' },
    peerDependencies: { '@earendil-works/pi-coding-agent': '0.85.0', ws: '8.21.0' },
    devDependencies: { compiler: '1.0.0' },
  };
  assert.deepEqual(runtimeDependencyNames(meta), ['@earendil-works/pi-coding-agent', 'ws', 'runtime']);
  assert.deepEqual(runtimeDependencyNames(meta, { reducedRuntime: true }), ['ws', 'runtime']);
});

test('doctor detects dependencies whose package exports are import-only', t => {
  const folder = sandbox(t);
  put(folder, 'node_modules/@example/import-only/package.json', JSON.stringify({
    name: '@example/import-only',
    exports: { '.': { import: './index.js' } }
  }));
  assert.equal(dependencyInstalled(folder, '@example/import-only'), true);
  assert.equal(dependencyInstalled(folder, '@example/missing'), false);
});
test('doctor never runs an RTK binary', t => {
  const home = sandbox(t), calls = [];
  execute(plan({ home }));
  inspect({ home, spawn: (command) => { calls.push(command); return { status: 0, stdout: '0.85.1\n' }; } });
  assert.deepEqual(calls, ['pi']);
});
test('argument parser rejects typos and defaults to dry run', () => {
  assert.equal(args([]).apply, false);
  assert.equal(args([]).withRtk, false);
  assert.equal(args([]).migratePackages, false);
  assert.equal(args([]).retireOrcaSkills, false);
  assert.equal(args([]).release, undefined);
  assert.equal(args(['--apply']).apply, true);
  assert.throws(() => args(['--with-rtk']), /retired/);
  assert.equal(args(['--migrate-base']).migrateBase, true);
  assert.equal(args(['--migrate-packages']).migratePackages, true);
  assert.equal(args(['--retire-orca-skills']).retireOrcaSkills, true);
  assert.equal(args(['--release', 'h-aaa-s-bbb-m-ccc']).release, 'h-aaa-s-bbb-m-ccc');
  assert.throws(() => args(['--home']));
  assert.throws(() => args(['--release']));
  assert.throws(() => args(['--force']));
});
