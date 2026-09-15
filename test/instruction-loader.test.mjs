import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { execute, plan } from '../scripts/install.mjs';
import { identifyInstalledPiHost, runtimeEnvironment } from '../scripts/runtime-smoke.mjs';

const PREFIX = 'INSTRUCTION_LOADER_INSPECT ';
const strictLoaderCheck = process.env.PI_RUN_INSTRUCTION_LOADER_TESTS === '1';
let installedHost, unavailableHost;
try {
  installedHost = identifyInstalledPiHost('0.85.1');
} catch (error) {
  unavailableHost = error instanceof Error ? error.message : String(error);
}
const loaderSkip = !installedHost && !strictLoaderCheck
  ? `exact installed Pi 0.85.1 host unavailable (${unavailableHost}); set PI_RUN_INSTRUCTION_LOADER_TESTS=1 to require it`
  : false;

function inspectRolePrompt({ host, env, agentDir, cwd, temp, roleAppend, label }) {
  const inspector = path.join(temp, `instruction-inspector-${label}.mjs`);
  fs.writeFileSync(inspector, `export default function(pi) {
    pi.registerCommand('instruction-loader-inspect', {
      description: 'Inspect isolated system prompt inputs',
      handler: async (_args, ctx) => ctx.ui.notify(${JSON.stringify(PREFIX)} + JSON.stringify({
        systemPrompt: ctx.getSystemPrompt(),
        options: ctx.getSystemPromptOptions(),
      }), 'info'),
    });
  }\n`);
  const input = `${JSON.stringify({ id: label, type: 'prompt', message: '/instruction-loader-inspect' })}\n`;
  const result = spawnSync(process.execPath, [host.cli, '--mode', 'rpc', '--no-session', '--offline',
    ...(roleAppend === undefined ? [] : ['--append-system-prompt', roleAppend]),
    '--extension', inspector, '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes'], {
    cwd, env, input, encoding: 'utf8', shell: false, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  assert.equal(result.stderr.trim(), '');
  const messages = result.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(messages.some(message => ['extension_error', 'agent_start'].includes(message.type)), false);
  assert.equal(messages.find(message => message.id === label)?.success, true);
  const notice = messages.find(message => message.type === 'extension_ui_request'
    && message.method === 'notify' && message.message?.startsWith(PREFIX));
  assert.ok(notice, 'Official loader prompt inspection notification missing');
  return JSON.parse(notice.message.slice(PREFIX.length));
}

test('official Pi 0.85.1 loader keeps the global AGENTS adapter for parent and explicit role/grandchild appends', { skip: loaderSkip }, t => {
  assert.ok(installedHost, `strict instruction loader check requires exact installed Pi 0.85.1: ${unavailableHost}`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-instruction-loader-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const home = path.join(work, 'home');
  const agentDir = path.join(home, '.pi', 'agent');
  const cwd = path.join(work, 'project');
  const grandchildCwd = path.join(cwd, 'child', 'grandchild');
  const temp = path.join(work, 'tmp');
  for (const dir of [home, agentDir, grandchildCwd, temp]) fs.mkdirSync(dir, { recursive: true });
  execute(plan({ home }));
  fs.writeFileSync(path.join(agentDir, 'settings.json'), '{}\n');
  fs.writeFileSync(path.join(agentDir, 'APPEND_SYSTEM.md'), 'DISCOVERED_APPEND_SENTINEL\n');

  const env = runtimeEnvironment(process.env, { home, agentDir, cwd, temp });
  const host = identifyInstalledPiHost('0.85.1', { env });
  assert.equal(host.packageSha256, installedHost.packageSha256);
  const adapterPath = path.join(agentDir, 'AGENTS.md');
  const sharedPath = path.join(home, '.agents', 'SYSTEM.md').replaceAll('\\', '/');
  for (const launch of [
    { cwd, label: 'parent-startup' },
    { cwd, label: 'worker-role', roleAppend: 'EXPLICIT_WORKER_ROLE_APPEND' },
    { cwd: grandchildCwd, label: 'grandchild-role', roleAppend: 'EXPLICIT_GRANDCHILD_ROLE_APPEND' },
  ]) {
    const observed = inspectRolePrompt({ host, env, agentDir, temp, ...launch });
    if (launch.roleAppend === undefined) {
      assert.match(observed.options.appendSystemPrompt, /DISCOVERED_APPEND_SENTINEL/);
      assert.match(observed.systemPrompt, /DISCOVERED_APPEND_SENTINEL/);
    } else {
      assert.equal(observed.options.appendSystemPrompt, launch.roleAppend);
      assert.match(observed.systemPrompt, new RegExp(launch.roleAppend));
      assert.doesNotMatch(observed.systemPrompt, /DISCOVERED_APPEND_SENTINEL/);
    }
    const adapter = observed.options.contextFiles.find(file => path.resolve(file.path) === adapterPath);
    assert.ok(adapter, `${launch.label} did not load the global AGENTS adapter`);
    assert.match(adapter.content, new RegExp(sharedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(observed.systemPrompt, /agent-config:shared-instructions:start/);
    assert.match(observed.systemPrompt, new RegExp(sharedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
