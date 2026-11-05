import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { identifyInstalledPiHost, runtimeEnvironment } from '../scripts/runtime-smoke.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
test('native migration enables official codemode without replacing inherited default tools', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(repo, 'config/pi.settings.json')));
  assert.deepEqual(settings.defaultTools, ['+codemode']);
});

test('native plugins and Executor approvals run through the offline Pi SDK', { timeout: 120000 }, t => {
  if (!fs.existsSync(path.join(repo, 'native/node_modules/pi-mcp-adapter/index.ts'))) {
    assert.notEqual(process.env.PI_NATIVE_REQUIRED, '1', 'native dependencies required but absent');
    t.skip('prepare native dependencies to run the SDK integration');
    return;
  }
  const host = identifyInstalledPiHost('1.5.0');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-runtime-'));
  try {
    const home = path.join(root, 'home'), agentDir = path.join(home, '.pi/agent');
    const cwd = path.join(root, 'cwd'), temp = path.join(root, 'tmp');
    for (const dir of [agentDir, cwd, temp]) fs.mkdirSync(dir, { recursive: true });
    const env = { ...runtimeEnvironment(process.env, { home, agentDir, cwd, temp }),
      PI_E2E_LIVE: '0', OLLAMA_NATIVE_WARM: '0', JITI_FS_CACHE: path.join(temp, 'jiti') };
    const run = spawnSync(process.execPath, [path.join(repo, 'test/fixtures/native-runtime.mjs'), host.packageRoot, repo], {
      cwd, env, encoding: 'utf8', timeout: 110000, maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(run.status, 0, `${run.error?.message ?? ''}\n${run.stderr}\n${run.stdout}`);
    t.diagnostic(run.stdout.trim());
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
