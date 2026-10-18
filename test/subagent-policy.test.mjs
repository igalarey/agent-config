import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import priority from '../agents/luna-fast.mjs';
import * as runtimeSmoke from '../scripts/runtime-smoke.mjs';

const { readSubagentSmokePolicy } = runtimeSmoke;

const model = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-6-luna' };
function handler() {
  let hook;
  priority({ on(event, fn) { assert.equal(event, 'before_provider_request'); hook = fn; } });
  return hook;
}

test('Luna priority preserves reasoning and request content without mutating input', () => {
  const payload = { model: model.id, reasoning: { effort: 'high' }, input: [], instructions: 'fixture', service_tier: 'default' };
  const before = structuredClone(payload);
  assert.deepEqual(handler()({ payload }, { model }), { ...payload, service_tier: 'priority' });
  assert.deepEqual(payload, before);
});

test('priority does not affect Astra, Sol, other providers or unknown models', () => {
  for (const other of [undefined, { ...model, id: 'gpt-6-astra' }, { ...model, id: 'gpt-6.1-sol' }, { ...model, provider: 'other' }, { ...model, api: 'openai-responses' }]) {
    assert.equal(handler()({ payload: { input: [] } }, { model: other }), undefined);
  }
});

test('profiles pin models with explicit local tools and bounded turns', () => {
  for (const [name, modelId, thinking, writable] of [
    ['Explore', 'gpt-6.1-sol', 'high', false], ['general-purpose', 'gpt-6.1-sol', 'high', true],
    ['Plan', 'gpt-6-astra', 'low', false], ['deep-implementation', 'gpt-6-astra', 'low', true], ['deep-review', 'gpt-6-astra', 'low', false],
  ]) {
    const text = fs.readFileSync(new URL(`../agents/${name}.md`, import.meta.url), 'utf8');
    assert.ok(text.includes(`model: openai-codex/${modelId}\n`), name);
    assert.ok(text.includes(`thinking: ${thinking}\n`), name);
    assert.ok(text.includes(`tools: ${writable ? 'read, grep, find, ls, bash, edit, write' : 'read, grep, find, ls'}\n`), name);
    assert.match(text, /max_turns: [1-9]\d?\n/);
    assert.match(text, /prompt_mode: append/);
    assert.match(text, /skills: false/);
    assert.match(text, /allowed_subagents: none/);
    assert.ok(text.includes('extensions: false\n'), name);
    assert.doesNotMatch(text, /Luna|priority|luna-fast/);
    assert.match(text, new RegExp(`description: .*${modelId === 'gpt-6.1-sol' ? 'Sol high' : 'Astra low'}`));
  }
  const settings = JSON.parse(fs.readFileSync(new URL('../config/subagents.json', import.meta.url)));
  assert.equal(settings.maxSubagentDepth, 1);
  assert.equal(settings.worktreeIsolation, false);
  assert.equal(settings.maxConcurrent, 6);
  assert.equal(settings.maxConcurrentForeground, 2);
});

test('runtime smoke reads profile policy, retains historical effort and priority, and rejects unsupported pins', t => {
  const release = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-smoke-policy-'));
  t.after(() => fs.rmSync(release, { recursive: true, force: true }));
  fs.mkdirSync(path.join(release, 'agents'));
  const names = ['Explore', 'general-purpose', 'Plan', 'deep-implementation', 'deep-review'];
  const writeProfiles = (models, efforts, hook = true) => {
    const expected = {};
    for (const [index, name] of names.entries()) {
      const id = models[index < 2 ? 0 : 1], thinking = efforts[index < 2 ? 0 : 1];
      const serviceTier = id === 'gpt-6-luna' ? 'priority' : undefined;
      fs.writeFileSync(path.join(release, 'agents', `${name}.md`), `---\nname: ${name}\nmodel: openai-codex/${id}\nthinking: ${thinking}\nextensions: ${serviceTier ? '["~/.pi/agent/agents/luna-fast.mjs"]' : 'false'}\n---\n`);
      expected[name] = { model: id, thinking, ...(serviceTier ? { serviceTier } : {}) };
    }
    const hookPath = path.join(release, 'agents/luna-fast.mjs');
    if (hook) fs.copyFileSync(new URL('../agents/luna-fast.mjs', import.meta.url), hookPath);
    else fs.rmSync(hookPath, { force: true });
    return expected;
  };
  const current = writeProfiles(['gpt-6.1-sol', 'gpt-6-astra'], ['high', 'low']);
  assert.deepEqual(readSubagentSmokePolicy(release), current);
  assert.deepEqual(readSubagentSmokePolicy(path.resolve(import.meta.dirname, '..')), current);
  for (const hook of [false, true]) {
    const expected = writeProfiles(['gpt-6.1-sol', 'gpt-6-astra'], ['high', 'low'], hook);
    assert.deepEqual(readSubagentSmokePolicy(release), expected);
  }
  for (const sol of ['gpt-6-sol', 'gpt-6.1-sol']) {
    for (const effort of ['medium', 'high']) {
      const historical = writeProfiles(['gpt-6-luna', sol], [effort, 'high']);
      assert.deepEqual(readSubagentSmokePolicy(release), historical);
    }
  }
  for (const [models, efforts] of [
    [['unknown', 'gpt-6-astra'], ['high', 'low']],
    [['gpt-6.1-sol', 'gpt-6-astra'], ['high', 'high']],
    [['gpt-6.1-sol', 'gpt-6-astra'], ['low', 'low']],
  ]) {
    writeProfiles(models, efforts);
    assert.throws(() => readSubagentSmokePolicy(release), /Unsupported subagent policy/);
  }
  writeProfiles(['gpt-6.1-sol', 'gpt-6-astra'], ['high', 'low']);
  const explore = path.join(release, 'agents/Explore.md');
  const original = fs.readFileSync(explore, 'utf8');
  for (const text of [original.replace('extensions: false', 'extensions: true'), original.replace('openai-codex/', 'other/'), original.replace('thinking: high\n', '')]) {
    fs.writeFileSync(explore, text);
    assert.throws(() => readSubagentSmokePolicy(release), /Unsupported subagent policy/);
  }
  for (const name of names) fs.rmSync(path.join(release, 'agents', `${name}.md`));
  for (const name of names.slice(0, 3)) fs.writeFileSync(path.join(release, 'agents', `${name}.md`), `---\nname: ${name}\n---\nLegacy profile without model pins.\n`);
  assert.equal(readSubagentSmokePolicy(release), null);
  fs.writeFileSync(explore, original);
  assert.throws(() => readSubagentSmokePolicy(release), /Unsupported subagent policy/);
});
