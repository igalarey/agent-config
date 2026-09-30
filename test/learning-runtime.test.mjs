import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { identifyInstalledPiHost, runtimeEnvironment } from '../scripts/runtime-smoke.mjs';

const VERSION = '0.87.1';

test('learning extension integrates through the exact installed Pi SDK without a model', { timeout: 60000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-runtime-'));
  try {
    const home = path.join(root, 'home'), agentDir = path.join(home, '.pi', 'agent');
    const cwd = path.join(root, 'cwd'), temp = path.join(root, 'tmp');
    for (const dir of [home, agentDir, cwd, temp]) fs.mkdirSync(dir, { recursive: true });
    const env = runtimeEnvironment(process.env, { home, agentDir, temp, cwd });
    const host = identifyInstalledPiHost(VERSION, { env });
    const extension = path.resolve('extensions/learning/index.ts');
    const sdk = path.join(host.packageRoot, 'dist/index.js');
    const script = path.join(root, 'exercise.mjs');
    fs.writeFileSync(script, `
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createAgentSession, DefaultResourceLoader, SessionManager } from ${JSON.stringify(pathToFileURL(sdk).href)};
const loader = new DefaultResourceLoader({ cwd: process.env.PWD, agentDir: process.env.PI_CODING_AGENT_DIR,
  additionalExtensionPaths: [${JSON.stringify(extension)}], noSkills: false, noPromptTemplates: true, noThemes: true, noContextFiles: true });
await loader.reload();
const { session } = await createAgentSession({ cwd: process.env.PWD, agentDir: process.env.PI_CODING_AGENT_DIR,
  resourceLoader: loader, sessionManager: SessionManager.inMemory(process.env.PWD), noTools: true });
const notices = [], preview = { value: undefined }, confirmations = [];
let beforeConfirm = () => {};
const ui = { notify: (text) => notices.push(String(text)), editor: async (_title, text) => preview.value ?? text,
  confirm: async (...args) => { confirmations.push(args); beforeConfirm(); return true; } };
await session.bindExtensions({ mode: 'tui', uiContext: ui });
const prompt = async command => session.prompt(command, { source: 'interactive' });
const definition = session.getToolDefinition('learning_propose');
assert(definition, 'official SDK did not register learning_propose');
const call = async name => {
  const input = { name, content: '---\\nname: '+name+'\\ndescription: Verified procedure\\n---\\n\\n1. Check the result.', summary: 'Verified procedure', evidence: 'Ran the procedure and verified its result.' };
  const result = await definition.execute('runtime-learning', input, undefined, undefined, { sessionManager: session.sessionManager, cwd: process.env.PWD });
  assert.match(result.content[0].text, /Staged/); return result.details.id;
};
await prompt('/learn');
assert(notices.length === 0, 'review command unexpectedly required a UI dialog');
let id = await call('learned-runtime-approved');
await prompt('/learn pending'); assert.match(notices.at(-1), new RegExp(id));
await prompt('/learn show '+id);
preview.value = 'edited'; await prompt('/learn approve '+id); assert.match(notices.at(-1), /edited/);
preview.value = undefined; ui.confirm = async () => false; await prompt('/learn approve '+id); assert.match(notices.at(-1), /pending/);
ui.confirm = async () => { beforeConfirm(); return true; }; await prompt('/learn approve '+id);
const skill = path.join(process.env.PI_CODING_AGENT_DIR, 'skills/learned/learned-runtime-approved/SKILL.md');
assert.match(fs.readFileSync(skill, 'utf8'), /Verified procedure/);
await loader.reload(); assert(loader.getSkills().skills.some(s => s.name === 'learned-runtime-approved'), 'approved skill absent after official resource reload');
id = await call('learned-runtime-rejected'); await prompt('/learn reject '+id);
assert.match(notices.at(-1), /Rejected/);
assert.equal(fs.existsSync(path.join(process.env.PI_CODING_AGENT_DIR, 'skills/learned/learned-runtime-rejected')), false);
const collisionDir = path.join(process.env.PI_CODING_AGENT_DIR, 'skills/user');
fs.mkdirSync(collisionDir, { recursive: true });
fs.writeFileSync(path.join(collisionDir, 'SKILL.md'), '---\\nname: learned-runtime-collision\\ndescription: Existing user skill\\n---\\nPreserve this skill.');
await loader.reload();
await assert.rejects(call('learned-runtime-collision'), /collid|already exists/i);
id = await call('learned-runtime-headless');
await session.bindExtensions({ mode: 'rpc', uiContext: ui });
await prompt('/learn approve '+id); assert.match(notices.at(-1), /interactive TUI/);
assert.equal(fs.existsSync(path.join(process.env.PI_CODING_AGENT_DIR, 'skills/learned/learned-runtime-headless')), false);
await session.bindExtensions({ mode: 'tui', uiContext: ui });
await prompt('/learn reject '+id);
id = await call('learned-runtime-approved');
beforeConfirm = () => fs.writeFileSync(skill, 'User changed the target during review.');
await prompt('/learn approve '+id); assert.match(notices.at(-1), /changed|Stale/i);
assert.equal(fs.readFileSync(skill, 'utf8'), 'User changed the target during review.');
await session.dispose();
`);
    const run = spawnSync(process.execPath, [script], { cwd, env, encoding: 'utf8', timeout: 50000, shell: false });
    assert.equal(run.status, 0, run.error?.message ?? `${run.stderr}\n${run.stdout}`);
    assert.equal(run.stderr.trim(), '');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
