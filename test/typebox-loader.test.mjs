import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { identifyInstalledPiHost, runtimeEnvironment, resolvePiHostDependency } from '../scripts/runtime-smoke.mjs';

const releasePath = process.env.PI_TYPEBOX_RELEASE_PATH;
test('official Pi 1.3 loader shares host TypeBox identities despite pinned package dependency metadata', { skip: !releasePath }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typebox-loader-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), agentDir = path.join(home, '.pi/agent'), temp = path.join(root, 'tmp');
  for (const dir of [home, agentDir, temp]) fs.mkdirSync(dir, { recursive: true });
  const env = runtimeEnvironment(process.env, { home, agentDir, temp, cwd: root });
  const host = identifyInstalledPiHost('1.3.0', { env });
  const typebox = resolvePiHostDependency(host, 'typebox');
  const packages = [
    ['packages/@tintinweb/pi-subagents', '@tintinweb/pi-subagents', '0.19.0'],
    ['packages/@tintinweb/pi-tasks', '@tintinweb/pi-tasks', '0.9.0'],
    ['packages/pi-supervisor', 'pi-supervisor', '0.5.0'],
    ['native/node_modules/pi-web-access', 'pi-web-access', '0.29.0'],
  ];
  const probes = packages.map(([relative, name, version], i) => {
    const source = path.join(releasePath, relative);
    const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    assert.equal(metadata.name, name); assert.equal(metadata.version, version);
    assert(metadata.dependencies.typebox, `${name}: packaging warning precondition missing`);
    const folder = path.join(temp, `package-${i}`);
    fs.mkdirSync(folder);
    fs.copyFileSync(path.join(source, 'package.json'), path.join(folder, 'package.json'));
    if (fs.existsSync(path.join(source, 'node_modules'))) fs.symlinkSync(path.join(source, 'node_modules'), path.join(folder, 'node_modules'), 'dir');
    const probe = path.join(folder, 'probe.ts');
    fs.writeFileSync(probe, `import { Type } from 'typebox';
import { Type as LegacyType } from '@sinclair/typebox';
import { Compile } from 'typebox/compile';
import { Compile as LegacyCompile } from '@sinclair/typebox/compile';
import { Check, Errors } from 'typebox/value';
import { Check as LegacyCheck } from '@sinclair/typebox/value';
import { Type as PiType } from '@earendil-works/pi-ai';
export default function () {
  const host = globalThis[Symbol.for('agent-config.typebox-proof')];
  host.results.push({ package: ${JSON.stringify(name)}, shared: Type === host.Type && LegacyType === host.Type && PiType === host.Type
    && Compile === host.Compile && LegacyCompile === host.Compile && Check === host.Check && LegacyCheck === host.Check && Errors === host.Errors,
    validates: Check(Type.Object({ value: Type.String() }), { value: 'valid' }) && !Check(Type.String(), 1) });
}`);
    return probe;
  });
  const script = path.join(temp, 'exercise.mjs');
  fs.writeFileSync(script, `import assert from 'node:assert/strict';
import { Type } from ${JSON.stringify(path.join(typebox, 'build/index.mjs'))};
import { Compile } from ${JSON.stringify(path.join(typebox, 'build/compile/index.mjs'))};
import { Check, Errors } from ${JSON.stringify(path.join(typebox, 'build/value/index.mjs'))};
import { loadExtensions } from ${JSON.stringify(path.join(host.packageRoot, 'dist/core/extensions/loader.js'))};
const proof = { Type, Compile, Check, Errors, results: [] };
globalThis[Symbol.for('agent-config.typebox-proof')] = proof;
const loaded = await loadExtensions(${JSON.stringify(probes)}, process.cwd());
assert.deepEqual(loaded.errors, []);
assert.equal(proof.results.length, 4);
assert(proof.results.every(result => result.shared && result.validates), JSON.stringify(proof.results));
console.log(JSON.stringify(proof.results));
`);
  const run = spawnSync(process.execPath, [script], { cwd: root, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.error?.message ?? `${run.stderr}\n${run.stdout}`);
  assert.equal(run.stderr.trim(), '');
  t.diagnostic(run.stdout.trim());
});
