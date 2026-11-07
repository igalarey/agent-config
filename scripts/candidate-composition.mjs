import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { identifyInstalledPiHost, modernInteractive } from './runtime-smoke.mjs';
import { validateSkills } from './validate-skills.mjs';

const names = ['TaskCreate', 'TaskExecute', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate'];
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));

export async function checkCandidateComposition(candidatePath) {
  const manifest = readJSON(path.join(candidatePath, 'release.json'));
  if (manifest.files?.some(file => file.path === 'scripts/validate-skills.mjs' || file.path === 'manifests/curated-skills.json' || file.path.startsWith('pi-skills/'))) {
    assert.deepEqual(validateSkills(path.join(candidatePath, 'pi-skills')), [], 'candidate skill references and dependencies');
  }
  const owner = manifest.packages.find(pkg => pkg.name === '@tintinweb/pi-tasks');
  const adapter = path.join(candidatePath, 'extensions/carbon-tasks/index.ts');
  if (!owner && !fs.existsSync(adapter) && !modernInteractive(manifest) && !manifest.packages.some(pkg => pkg.name === '@tintinweb/pi-subagents')) {
    return { applicable: false, reason: 'Historical candidate has no Carbon/Tasks composition' };
  }
  const tasksAbsent = !owner && !fs.existsSync(adapter);
  assert.ok(tasksAbsent || (owner && fs.existsSync(adapter)), 'Carbon/Tasks composition must be complete');
  const host = identifyInstalledPiHost(manifest.piVersion);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-composition-'));
  const previous = { ...process.env };
  try {
    const agentDir = path.join(temporary, '.pi/agent');
    const cwd = path.join(temporary, 'project');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(cwd);
    process.env.HOME = temporary;
    process.env.USERPROFILE = temporary;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.PI_OFFLINE = '1';
    process.env.npm_config_offline = 'true';
    delete process.env.PI_TASKS;
    const { DefaultResourceLoader } = await import(pathToFileURL(path.join(host.packageRoot, 'dist/core/resource-loader.js')));
    const { SettingsManager } = await import(pathToFileURL(path.join(host.packageRoot, 'dist/core/settings-manager.js')));
    // Project the candidate resources exactly as deployed; never import repository vendor sources.
    for (const directory of tasksAbsent ? ['carbon-ui'] : ['carbon-tasks', 'carbon-ui']) {
      fs.cpSync(path.join(candidatePath, 'extensions', directory), path.join(agentDir, 'extensions', directory), { recursive: true });
    }
    fs.writeFileSync(path.join(agentDir, 'tasks-config.json'), JSON.stringify({ taskScope: 'session-global', autoCascade: false, autoClearCompleted: 'never' }));
    const source = owner ? path.join(candidatePath, owner.path) : undefined;
    const defaults = readJSON(path.join(candidatePath, 'config/pi.settings.json'));
    const load = async (duplicate = false, baseline = false) => {
      fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({
        ...defaults,
        packages: tasksAbsent ? [] : [baseline || duplicate ? source : { source, extensions: [] }],
        extensions: baseline ? ['-builtin:mcp', '-extensions/carbon-tasks/index.ts', '-extensions/carbon-ui/index.ts'] : ['-builtin:mcp'],
      }));
      const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: SettingsManager.create(cwd, agentDir), noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
      await loader.reload();
      return loader.getExtensions();
    };
    const loaded = await load();
    if (tasksAbsent) {
      assert.deepEqual(loaded.errors, [], 'resource loader errors');
      const carbon = loaded.extensions.find(extension => extension.path === path.join(agentDir, 'extensions/carbon-ui/index.ts'));
      assert.ok(carbon, 'Carbon UI must load through the official SDK');
      const builtins = ['bash', 'edit', 'find', 'grep', 'ls', 'read', 'write'];
      let active = [...builtins];
      loaded.runtime.getActiveTools = () => [...active];
      loaded.runtime.getAllTools = () => builtins.map(name => ({ name, sourceInfo: { source: 'builtin' } }));
      loaded.runtime.setActiveTools = names => { active = names; };
      const ctx = { mode: 'tui', cwd, isProjectTrusted: () => false, isIdle: () => true, ui: {
        theme: { fg: (_color, text) => text }, setStatus() {}, setToolsExpanded() {}, setHiddenThinkingLabel() {},
        getEditorComponent() {}, setEditorComponent() {},
      } };
      for (const handler of carbon.handlers.get('session_start') ?? []) await handler({ reason: 'startup' }, ctx);
      for (const extension of loaded.extensions) {
        assert.ok(!names.some(name => extension.tools.has(name)), 'Tasks must be absent: tools');
        assert.ok(!extension.commands.has('tasks'), 'Tasks must be absent: command');
      }
      assert.deepEqual([...carbon.tools.keys()].sort(), builtins, 'Carbon built-in decoration remains active');
      assert.deepEqual(active, builtins, 'built-in activation unchanged');
      return { applicable: true, mode: 'official-sdk-resource-loader', tasks: 'absent', tools: builtins };
    }
    const assertUnique = result => {
      assert.deepEqual(result.errors, [], 'resource loader errors');
      for (const name of names) assert.equal(result.extensions.filter(extension => extension.tools.has(name)).length, 1, `${name} registered once`);
      assert.equal(result.extensions.filter(extension => extension.commands.has('tasks')).length, 1, 'tasks command registered once');
      assert.ok(!result.extensions.some(extension => path.resolve(extension.path).startsWith(source + path.sep)), 'original owner entrypoint must not load');
    };
    assertUnique(loaded);
    const tools = loaded.extensions.find(extension => extension.tools.has('TaskCreate')).tools;
    assert.deepEqual([...tools.keys()].sort(), names);
    for (const { definition } of tools.values()) {
      assert.equal(definition.renderShell, 'self');
      assert.equal(typeof definition.renderCall, 'function');
      assert.equal(typeof definition.renderResult, 'function');
    }
    const duplicate = await load(true);
    assert.throws(() => assertUnique(duplicate), /resource loader errors|registered once|original owner/);
    // Load the undecorated candidate owner in a separate loader for execution parity.
    fs.rmSync(path.join(agentDir, 'extensions'), { recursive: true });
    const baseline = await load(false, true);
    assert.deepEqual(baseline.errors, []);
    const originals = baseline.extensions.find(extension => extension.tools.has('TaskCreate')).tools;
    for (const name of names) {
      const actual = tools.get(name).definition;
      const original = originals.get(name).definition;
      assert.equal(actual.execute.toString(), original.execute.toString(), `${name} execution unchanged`);
      assert.deepEqual(actual.parameters, original.parameters, `${name} schema unchanged`);
      assert.equal(actual.description, original.description);
    }
    const exercise = async (result, sessionId) => {
      const extension = result.extensions.find(entry => entry.tools.has('TaskCreate'));
      const sessionFile = path.join(temporary, `${sessionId}.jsonl`);
      fs.writeFileSync(sessionFile, '');
      const ctx = { cwd, hasUI: false, isProjectTrusted: () => false, sessionManager: { getSessionId: () => sessionId, getSessionFile: () => sessionFile }, ui: { setWidget() {}, setStatus() {}, notify() {} } };
      for (const handler of extension.handlers.get('session_start') ?? []) await handler({ reason: 'startup' }, ctx);
      const invoke = async (name, args) => extension.tools.get(name).definition.execute('composition', args, new AbortController().signal, () => {}, ctx);
      const output = [];
      output.push(await invoke('TaskCreate', { subject: 'candidate composition', description: 'offline persisted task' }));
      output.push(await invoke('TaskGet', { taskId: '1' }));
      output.push(await invoke('TaskUpdate', { taskId: '1', status: 'in_progress' }));
      output.push(await invoke('TaskList', {}));
      assert.match(JSON.stringify(output[0]), /created successfully/);
      assert.match(JSON.stringify(output[1]), /offline persisted task/);
      assert.match(JSON.stringify(output[3]), /in_progress/);
      return output;
    };
    assert.deepEqual(await exercise(loaded, 'decorated'), await exercise(baseline, 'original'));
    assert.ok(fs.existsSync(path.join(agentDir, 'tasks/sessions')), 'task state persisted in temporary global directory');
    assert.ok(!fs.existsSync(path.join(cwd, '.pi/tasks')), 'no project persistence');
    return { applicable: true, mode: 'official-sdk-resource-loader', tools: names, negativeControl: 'duplicate-owner-rejected' };
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await checkCandidateComposition(path.resolve(process.argv[2])))); process.exit(0); }
  catch (error) { console.error(error.stack); process.exit(1); }
}
