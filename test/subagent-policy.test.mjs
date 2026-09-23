import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import priority from '../agents/luna-fast.mjs';

const model = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-6-luna' };
function handler() {
  let hook;
  priority({ on(event, fn) { assert.equal(event, 'before_provider_request'); hook = fn; } });
  return hook;
}

test('Luna priority preserves reasoning and request content without mutating input', () => {
  const payload = { model: model.id, reasoning: { effort: 'medium' }, input: [], instructions: 'fixture', service_tier: 'default' };
  const before = structuredClone(payload);
  assert.deepEqual(handler()({ payload }, { model }), { ...payload, service_tier: 'priority' });
  assert.deepEqual(payload, before);
});

test('priority does not affect Astra, Sol, other providers or unknown models', () => {
  for (const other of [undefined, { ...model, id: 'gpt-6-astra' }, { ...model, id: 'gpt-6-sol' }, { ...model, provider: 'other' }, { ...model, api: 'openai-responses' }]) {
    assert.equal(handler()({ payload: { input: [] } }, { model: other }), undefined);
  }
});

test('profiles pin models with explicit local tools and bounded turns', () => {
  for (const [name, family, thinking, writable] of [
    ['Explore', 'luna', 'medium', false], ['general-purpose', 'luna', 'medium', true],
    ['Plan', 'sol', 'high', false], ['deep-implementation', 'sol', 'high', true], ['deep-review', 'sol', 'high', false],
  ]) {
    const text = fs.readFileSync(new URL(`../agents/${name}.md`, import.meta.url), 'utf8');
    assert.ok(text.includes(`model: openai-codex/gpt-6-${family}\n`), name);
    assert.ok(text.includes(`thinking: ${thinking}\n`), name);
    assert.ok(text.includes(`tools: ${writable ? 'read, grep, find, ls, bash, edit, write' : 'read, grep, find, ls'}\n`), name);
    assert.match(text, /max_turns: [1-9]\d?\n/);
    assert.match(text, /prompt_mode: append/);
    assert.match(text, /skills: false/);
    assert.match(text, /allowed_subagents: none/);
    assert.ok(text.includes(family === 'luna' ? 'extensions: ["~/.pi/agent/agents/luna-fast.mjs"]' : 'extensions: false'));
  }
  const settings = JSON.parse(fs.readFileSync(new URL('../config/subagents.json', import.meta.url)));
  assert.equal(settings.maxSubagentDepth, 1);
  assert.equal(settings.worktreeIsolation, false);
  assert.equal(settings.maxConcurrent, 6);
  assert.equal(settings.maxConcurrentForeground, 2);
});
