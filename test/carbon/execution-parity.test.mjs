import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { PI_ROOT as root, resource, REPO, TUI_ROOT, JITI_ROOT } from './support.mjs';
const tools = await import(pathToFileURL(root + '/dist/core/tools/index.js'));
const { loadExtensions } = await import(pathToFileURL(root + '/dist/core/extensions/loader.js'));
const { createJiti } = await import(pathToFileURL(JITI_ROOT + '/lib/jiti.mjs'));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: {
  '@earendil-works/pi-coding-agent': root + '/dist/index.js',
  '@earendil-works/pi-tui': TUI_ROOT + '/dist/index.js',
} });
const { decorateToolDefinition } = await jiti.import(resource('extensions/carbon-ui/tool-card.ts'));
const run = (definition, args, signal = new AbortController().signal, updates = []) => definition.execute('parity', args, signal, value => updates.push(value), {sessionManager: {getSessionId: () => 'carbon-parity', getSessionFile: () => undefined}});

test('official execute, schemas, metadata and results stay unchanged for all seven tools', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'carbon-parity-'));
  try {
    const cases = [
      ['bash', {command: "printf 'carbon\\n'"}],
      ['read', {path: 'example.ts'}],
      ['edit', {path: 'example.ts', edits: [{oldText: 'false', newText: 'true'}]}],
      ['write', {path: 'example.ts', content: 'export const compact = true;\n'}],
      ['grep', {pattern: 'compact', path: '.'}],
      ['find', {pattern: '*.ts', path: '.'}],
      ['ls', {path: '.'}],
    ];
    for (const [name, args] of cases) {
      const original = tools.createAllToolDefinitions(cwd)[name];
      const decorated = decorateToolDefinition(original);
      for (const key of ['execute', 'parameters', 'prepareArguments', 'description', 'promptSnippet', 'promptGuidelines']) {
        assert.equal(decorated[key], original[key], `${name}.${key}`);
      }
      writeFileSync(join(cwd, 'example.ts'), 'export const compact = false;\n');
      const expected = await run(original, args);
      const expectedFile = readFileSync(join(cwd, 'example.ts'), 'utf8');
      writeFileSync(join(cwd, 'example.ts'), 'export const compact = false;\n');
      const actual = await run(decorated, args);
      assert.deepEqual(actual, expected, name);
      assert.equal(readFileSync(join(cwd, 'example.ts'), 'utf8'), expectedFile);
    }
  } finally {
    rmSync(cwd, {recursive: true, force: true});
  }
});

test('bash keeps streaming callbacks and cancellation', async () => {
  const original = tools.createBashToolDefinition('/tmp');
  const decorated = decorateToolDefinition(original);
  for (const definition of [original, decorated]) {
    const updates = [];
    const controller = new AbortController();
    const execution = run(definition, {command: "printf 'partial\\n'; sleep 10"}, controller.signal, updates);
    const timer = setTimeout(() => controller.abort(), 150);
    await assert.rejects(execution, /abort/i);
    clearTimeout(timer);
    assert.ok(updates.some(update => update.content.some(block => block.type === 'text' && block.text.includes('partial'))));
  }
});

test('built-in decoration preserves tool activation filters and third-party overrides', async () => {
  const result = await loadExtensions([resource('extensions/carbon-ui/index.ts')], '/tmp');
  assert.deepEqual(result.errors, []);
  let active = ['read', 'TaskList'];
  result.runtime.getActiveTools = () => [...active];
  result.runtime.getAllTools = () => ['bash', 'read', 'edit', 'write', 'grep', 'find', 'ls'].map(name => ({name, sourceInfo: {source: name === 'write' ? 'sdk' : 'builtin'}}));
  result.runtime.setActiveTools = names => { active = names; };
  const extension = result.extensions[0];
  const ctx = {mode:'tui', cwd:'/tmp', isProjectTrusted:()=>false, isIdle:()=>true, ui:{
    theme:{fg:(_color,text)=>text}, setStatus(){}, setToolsExpanded(){}, setHiddenThinkingLabel(){}, getEditorComponent(){}, setEditorComponent(){},
  }};
  for (const handler of extension.handlers.get('session_start')) await handler({reason:'startup'}, ctx);
  assert.deepEqual(active, ['read', 'TaskList']);
  assert.equal(extension.tools.has('write'), false);
  assert.equal(extension.tools.size, 6);
});

test('tasks adapter loads the owner once and decorates its seven original tools', async () => {
  const agentDir = mkdtempSync(join(tmpdir(), 'carbon-task-config-'));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  let result;
  try {
    writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [{ source: resource('vendor/pi-tasks'), extensions: [] }] }));
    process.env.PI_CODING_AGENT_DIR = agentDir;
    result = await loadExtensions([resource('extensions/carbon-tasks/index.ts')], '/tmp');
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
  }
  assert.deepEqual(result.errors, []);
  const extension = result.extensions[0];
  assert.deepEqual([...extension.tools.keys()].sort(), ['TaskCreate','TaskExecute','TaskGet','TaskList','TaskOutput','TaskStop','TaskUpdate'].sort());
  for (const registered of extension.tools.values()) {
    const definition = registered.definition ?? registered;
    assert.equal(definition.renderShell, 'self');
    assert.equal(typeof definition.execute, 'function');
  }
  assert.ok(extension.commands.has('tasks'));
});
