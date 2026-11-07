import test from 'node:test';
import assert from 'node:assert/strict';
import { installProcedureRouting } from '../extensions/learning/routing.mjs';

test('routing is a stable instruction section, not tool authority or model routing', () => {
  let hook;
  const pi = { on: (name, callback) => { assert.equal(name, 'before_agent_start'); hook = callback; } };
  installProcedureRouting(pi);
  const event = { systemPrompt: 'Original prompt', systemPromptOptions: { sections: { original: 'preserve' }, selectedTools: ['read'], hiddenTools: [], skills: [{ name: 'actual-skill' }] } };
  assert.equal(hook(event), undefined);
  const section = event.systemPromptOptions.sections.procedure_routing;
  assert.match(section, /SKILL.md/);
  assert.match(section, /capability_request/);
  assert.match(section, /Never automatically expand/);
  assert.match(section, /not permissions/);
  assert(!section.includes('actual-skill'), 'must not duplicate the skill catalog');
  hook(event); assert.equal(event.systemPromptOptions.sections.procedure_routing, section);
  assert.deepEqual(event.systemPromptOptions.selectedTools, ['read']);
  assert.deepEqual(event.systemPromptOptions.hiddenTools, []);
  assert.equal(event.systemPromptOptions.sections.original, 'preserve');
  assert.equal(event.systemPrompt, 'Original prompt');
});
