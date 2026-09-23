import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { identifyPiHost, runtimeEnvironment } from '../scripts/runtime-smoke.mjs';

const enabled = process.env.PI_RUN_BROWSER_TESTS === '1';

test('browser loads through official Pi RPC with automatic public tools active, sensitive tools gated, and no model calls (opt-in)', { skip: !enabled }, t => {
  const source = path.resolve(import.meta.dirname, '..', 'vendor/pi-browser');
  const host = identifyPiHost('0.87.1', {
    packageRoot: path.join(source, 'node_modules', '@earendil-works', 'pi-coding-agent'),
  });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-browser-loader-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const home = path.join(work, 'home'), agentDir = path.join(work, 'agent');
  const cwd = path.join(work, 'cwd'), temp = path.join(work, 'tmp');
  for (const dir of [home, agentDir, cwd, temp]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ packages: [source] }));
  const inspector = path.join(temp, 'inspector.mjs');
  fs.writeFileSync(inspector, `export default function(pi) {
    pi.registerCommand('browser-loader-inspect', {
      description: 'Offline browser fixture inspection',
      handler: async (_args, ctx) => ctx.ui.notify('BROWSER_INSPECT ' + JSON.stringify({
        tools: pi.getAllTools(), active: pi.getActiveTools(), commands: pi.getCommands(),
      }), 'info'),
    });
  }`);
  const input = [
    { id: 'inspect', type: 'prompt', message: '/browser-loader-inspect' },
    { id: 'off', type: 'prompt', message: '/browser off' },
  ].map(value => JSON.stringify(value)).join('\n') + '\n';
  const result = spawnSync(process.execPath, [host.cli, '--mode', 'rpc', '--no-session',
    '--extension', inspector, '--no-skills', '--no-context-files', '--no-prompt-templates', '--no-themes'], {
    cwd, env: runtimeEnvironment(process.env, { home, agentDir, cwd, temp }), input,
    encoding: 'utf8', shell: false, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  assert.equal(result.stderr.trim(), '');
  const messages = result.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(messages.some(message => ['extension_error', 'agent_start'].includes(message.type)), false);
  for (const id of ['inspect', 'off']) assert.equal(messages.find(message => message.id === id)?.success, true);
  const notice = messages.find(message => message.type === 'extension_ui_request'
    && message.method === 'notify' && message.message?.startsWith('BROWSER_INSPECT '));
  assert.ok(notice, 'Official loader inspector notification missing');
  const observed = JSON.parse(notice.message.slice('BROWSER_INSPECT '.length));
  const automatic = new Set(['browser_goto', 'browser_read', 'browser_click', 'browser_screenshot', 'browser_close']);
  const names = [...automatic, 'browser_fill'];
  for (const name of names) {
    const tool = observed.tools.find(tool => tool.name === name);
    assert.ok(tool, `Missing registered tool: ${name}`);
    assert.equal(observed.active.includes(name), automatic.has(name), `Unexpected startup activation for: ${name}`);
    assert.equal(tool.sourceInfo.origin, 'package');
    assert.equal(path.resolve(tool.sourceInfo.path), path.join(source, 'index.ts'));
  }
  assert.equal(observed.commands.some(command => command.name === 'browser'), true);
});
