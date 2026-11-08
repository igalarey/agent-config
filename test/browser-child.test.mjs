import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('local ui-verifier specialization is scoped, read-only, bounded and separate from upstream seven', () => {
  const text = fs.readFileSync(new URL('../agents/ui-verifier.md', import.meta.url), 'utf8');
  for (const line of ['name: ui-verifier', 'model: openai/gpt-6.1-sol', 'thinking: medium', 'max_turns: 20',
    'extensions: scoped', 'skill_catalog: smoke-test, grounded-citations', 'allowed_subagents: none',
    'auto-exit: true', 'prompt_mode: append', 'session-mode: standalone',
    'tools: read, grep, find, ls, browser_goto, browser_read, browser_click, browser_screenshot, browser_close']) {
    assert.ok(text.split('\n').includes(line), line);
  }
  assert.doesNotMatch(text.split('---')[1], /browser_fill|bash|write|edit|skills:/);
  assert.match(text, /user-authorized/);
  assert.match(text, /screenshot|DOM/);
  assert.match(text, /Local specialization/);
});
