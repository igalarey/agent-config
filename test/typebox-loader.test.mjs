import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { identifyInstalledPiHost, runtimeEnvironment, resolvePiHostDependency } from '../scripts/runtime-smoke.mjs';

test('Pi 1.5 validates loaded TypeBox aliases and the question schema through pi-schema', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-schema-loader-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), agentDir = path.join(home, '.pi/agent'), temp = path.join(root, 'tmp');
  for (const dir of [home, agentDir, temp]) fs.mkdirSync(dir, { recursive: true });
  const env = runtimeEnvironment(process.env, { home, agentDir, temp, cwd: root });
  const host = identifyInstalledPiHost('1.5.0', { env });
  const ai = resolvePiHostDependency(host, '@earendil-works/pi-ai');
  const extension = path.join(temp, 'schemas.ts');
  fs.writeFileSync(extension, `import { Type } from 'typebox';
import { Type as LegacyType } from '@sinclair/typebox';
import { Type as PiType, StringEnum } from '@earendil-works/pi-ai';
export default function (pi) {
  if (Type !== LegacyType || Type !== PiType) throw new Error('TypeBox aliases diverged');
  for (const [name, T] of [['current_schema', Type], ['legacy_schema', LegacyType], ['pi_ai_schema', PiType]]) {
    pi.registerTool({ name, label: name, description: 'Offline schema contract',
      parameters: T.Object({ count: T.Integer({ minimum: 1, maximum: 10 }),
        enabled: T.Boolean(), tags: T.Array(T.String({ minLength: 1 })),
        mode: StringEnum(['read', 'write']), note: T.Optional(T.String()),
        nullable: T.Union([T.String(), T.Null()]) }, { additionalProperties: false }),
      async execute(_id, params) { return { content: [{ type: 'text', text: JSON.stringify(params) }], details: params }; }
    });
  }
}`);
  const question = path.resolve(import.meta.dirname, '../vendor/pi-ask-user-question/index.ts');
  const script = path.join(temp, 'validate.mjs');
  fs.writeFileSync(script, `import assert from 'node:assert/strict';
import { loadExtensions } from ${JSON.stringify(path.join(host.packageRoot, 'dist/core/extensions/loader.js'))};
import { validateToolArguments } from ${JSON.stringify(path.join(ai, 'dist/utils/validation.js'))};
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Network forbidden'); };
const loaded = await loadExtensions(${JSON.stringify([extension, question])}, process.cwd());
assert.deepEqual(loaded.errors, []);
const definitions = loaded.extensions.flatMap(extension => [...extension.tools.values()].map(tool => tool.definition));
for (const name of ['current_schema', 'legacy_schema', 'pi_ai_schema']) {
  const tool = definitions.find(tool => tool.name === name);
  assert(tool, name);
  const input = { count: '2', enabled: 'true', tags: 'one', mode: 'read', note: null, nullable: null };
  const untouched = structuredClone(input);
  const validate = args => validateToolArguments(tool, { type: 'toolCall', id: name, name, arguments: args });
  const validated = validate(input);
  assert.deepEqual(validated, { count: 2, enabled: true, tags: ['one'], mode: 'read', nullable: null });
  assert.deepEqual(input, untouched, 'validation must not mutate the transcript');
  const result = await tool.execute(name, validated);
  assert.deepEqual(result.details, validated);
  for (const patch of [{ count: 0 }, { count: 11 }, { count: 'bad' }, { mode: 'unknown' }, { tags: [''] }, { extra: true }]) {
    assert.throws(() => validate({ ...input, ...patch }), /Validation failed/);
  }
  const { count, ...missing } = input;
  assert.throws(() => validate(missing), /count: missing/);
}
const question = definitions.find(tool => tool.name === 'ask_user_question');
assert(question);
const validateQuestion = args => validateToolArguments(question, { name: question.name, arguments: args });
assert.deepEqual(validateQuestion({ question: 'Choose', kind: 'single', options: ['A', 'B'] }),
  { question: 'Choose', kind: 'single', options: ['A', 'B'] });
for (const args of [{ question: '', kind: 'text' }, { question: 'Choose', kind: 'invalid' },
  { question: 'Choose', kind: 'single', options: ['A'] }, { question: 'Choose', kind: 'single', options: ['A', ''] }]) {
  assert.throws(() => validateQuestion(args), /Validation failed/);
}
assert.equal(networkCalls, 0);
console.log(JSON.stringify({ piVersion: '1.5.0', aliases: 3, questionSchema: true, networkCalls }));
`);
  const run = spawnSync(process.execPath, [script], { cwd: root, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.error?.message ?? `${run.stderr}\n${run.stdout}`);
  assert.equal(run.stderr.trim(), '');
  t.diagnostic(run.stdout.trim());
});

const releasePath = process.env.PI_TYPEBOX_RELEASE_PATH;
test('official Pi 1.5 loader shares host TypeBox identities with corrected host peer metadata', { skip: !releasePath }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typebox-loader-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), agentDir = path.join(home, '.pi/agent'), temp = path.join(root, 'tmp');
  for (const dir of [home, agentDir, temp]) fs.mkdirSync(dir, { recursive: true });
  const env = runtimeEnvironment(process.env, { home, agentDir, temp, cwd: root });
  const host = identifyInstalledPiHost('1.5.0', { env });
  const typebox = resolvePiHostDependency(host, 'typebox');
  const packages = [
    ['packages/@tintinweb/pi-subagents', '@tintinweb/pi-subagents', '0.19.0'],
    ['packages/@tintinweb/pi-tasks', '@tintinweb/pi-tasks', '0.9.0'],
    ['packages/pi-supervisor', 'pi-supervisor', '0.5.0'],
    ['native/node_modules/pi-web-access', 'pi-web-access', '0.32.0'],
  ];
  const probes = packages.map(([relative, name, version], i) => {
    const source = path.join(releasePath, relative);
    const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    assert.equal(metadata.name, name); assert.equal(metadata.version, version);
    assert(!metadata.dependencies?.typebox, `${name}: TypeBox must not be a runtime dependency`);
    assert.equal(metadata.peerDependencies.typebox, '*');
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
