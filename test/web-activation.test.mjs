import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { identifyInstalledPiHost, runtimeEnvironment, runWebActivationProbe } from '../scripts/runtime-smoke.mjs';
const extension = process.env.PI_WEB_ACTIVATION_PACKAGE;
test('official Pi executes web_enable and exposes web tools on the next model request', { skip: !extension }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-activation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), agentDir = path.join(home, '.pi/agent'), temp = path.join(root, 'tmp');
  for (const folder of [home, agentDir, temp]) fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(new URL('../config/web-search.json', import.meta.url), path.join(agentDir, 'web-search.json'));
  const env = runtimeEnvironment(process.env, { home, agentDir, temp, cwd: root });
  const host = identifyInstalledPiHost('1.3.0', { env });
  runWebActivationProbe({ host, env, cwd: root, temp, extension: path.join(extension, 'dist/index.js') });
});
