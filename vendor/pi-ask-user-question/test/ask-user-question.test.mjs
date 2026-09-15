import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverAndLoadExtensions } from '@earendil-works/pi-coding-agent';
import { normalizeOptions } from '../index.ts';

const root = path.resolve(import.meta.dirname, '..');

async function definition(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ask-user-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const loaded = await discoverAndLoadExtensions([path.join(root, 'index.ts')], directory, directory);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  assert.deepEqual([...loaded.extensions[0].tools.keys()], ['ask_user_question']);
  return loaded.extensions[0].tools.get('ask_user_question').definition;
}

function context({ inputs = [], selections = [], hasUI = true } = {}) {
  return {
    hasUI,
    ui: {
      input: async () => inputs.shift(),
      select: async (_question, options) => {
        const expected = selections.shift();
        if (typeof expected === 'function') return expected(options);
        return expected;
      },
    },
  };
}

test('Pi 0.85.1 loads the tool and free-text answers are trimmed', async t => {
  const tool = await definition(t);
  const result = await tool.execute('text', { question: 'Name?', kind: 'text' }, undefined, undefined,
    context({ inputs: ['  Ada  '] }));
  assert.equal(result.content[0].text, 'User answered: Ada');
  assert.deepEqual(result.details.answers, ['Ada']);
});

test('single and multiple selection use RPC-compatible select dialogs', async t => {
  const tool = await definition(t);
  const single = await tool.execute('single', { question: 'Pick', kind: 'single', options: ['A', 'B'] }, undefined, undefined,
    context({ selections: ['B'] }));
  assert.deepEqual(single.details.answers, ['B']);

  const multiple = await tool.execute('multiple', { question: 'Pick many', kind: 'multiple', options: ['A', 'B', 'C'] }, undefined, undefined,
    context({ selections: [
      options => options[0],
      options => options[0],
      options => options.find(value => value.startsWith('✓ Done')),
    ] }));
  assert.deepEqual(multiple.details.answers, ['A', 'B']);
  assert.match(multiple.content[0].text, /- A\n- B/);
});

test('cancellation is explicit and no-UI execution fails', async t => {
  const tool = await definition(t);
  const result = await tool.execute('cancel', { question: 'Continue?', kind: 'text' }, undefined, undefined,
    context({ inputs: [undefined] }));
  assert.equal(result.details.cancelled, true);
  assert.match(result.content[0].text, /Do not infer/);
  await assert.rejects(
    tool.execute('headless', { question: 'Continue?', kind: 'text' }, undefined, undefined, context({ hasUI: false })),
    /requires an interactive Pi UI/,
  );
});

test('option validation rejects missing and duplicate values', () => {
  assert.throws(() => normalizeOptions({ question: 'Pick', kind: 'single' }), /at least two/);
  assert.throws(() => normalizeOptions({ question: 'Pick', kind: 'multiple', options: ['same', 'same'] }), /unique/);
});
