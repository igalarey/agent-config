import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { verificationEnvironment } from '../scripts/verify-env.mjs';

const root = path.resolve(import.meta.dirname, '..');
test('Tasks-free composition loads real Carbon through the SDK and rejects Tasks registrations', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'composition-regression-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const candidate = path.join(home, 'candidate');
  fs.mkdirSync(path.join(candidate, 'config'), { recursive: true });
  fs.cpSync(path.join(root, 'extensions/carbon-ui'), path.join(candidate, 'extensions/carbon-ui'), { recursive: true });
  fs.writeFileSync(path.join(candidate, 'config/pi.settings.json'), '{}');
  fs.writeFileSync(path.join(candidate, 'release.json'), JSON.stringify({
    piVersion: JSON.parse(fs.readFileSync(path.join(root, 'manifests/packages.json'))).piVersion,
    packages: [{ name: '@tintinweb/pi-subagents' }],
  }));
  const check = () => spawnSync(process.execPath, [path.join(root, 'scripts/candidate-composition.mjs'), candidate], {
    cwd: home, encoding: 'utf8', env: verificationEnvironment({ ...process.env, HOME: home, PI_CODING_AGENT_DIR: path.join(home, '.pi/agent') }),
  });
  let result = check();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.applicable, true);
  assert.equal(report.tasks, 'absent');
  assert.equal(report.mode, 'official-sdk-resource-loader');
  assert.deepEqual(report.tools, ['bash', 'edit', 'find', 'grep', 'ls', 'read', 'write']);
  const entry = path.join(candidate, 'extensions/carbon-ui/index.ts');
  const original = fs.readFileSync(entry, 'utf8');
  for (const registration of [
    'pi.registerCommand("tasks", { description: "unexpected", handler: async () => {} });',
    'pi.registerTool({ name: "TaskList", label: "unexpected", description: "unexpected", parameters: {type:"object"}, execute: async () => ({content:[],details:{}}) });',
  ]) {
    fs.writeFileSync(entry, original.replace('export default function carbonUi(pi: ExtensionAPI): void {', `export default function carbonUi(pi: ExtensionAPI): void {\n${registration}`));
    result = check();
    assert.notEqual(result.status, 0, 'unexpected Tasks registration must fail');
    assert.match(result.stderr, /Tasks must be absent/);
  }
});
