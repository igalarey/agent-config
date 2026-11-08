import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { plan, execute } from '../scripts/install.mjs';
import * as smoke from '../scripts/runtime-smoke.mjs';

const root = path.resolve(import.meta.dirname, '..');
const roles = {
  scout: ['low', 20, false, 'diagnose-root'],
  worker: ['high', 30, false, 'diagnose-root, enforce-first, edit-document, simple-english'],
  reviewer: ['high', 30, false, 'security-review, enforce-first'],
  oracle: ['high', 30, false, 'elaborate-spec'],
  researcher: ['medium', 30, true, 'grounded-citations'],
  'evidence-auditor': ['high', 30, true, 'grounded-citations'],
  delegate: [undefined, 20, false, 'diagnose-root, enforce-first, edit-document, simple-english'],
};
const aliases = {
  Explore: 'c3f40f171ffb3d8d0b493bbf6649e610a1352c549f281856cbd319501b02d44c',
  'general-purpose': '7b08d6b33deafbb9a2ed9e670661324ce67cb7736bd49965630c74a1aaf229be',
  Plan: 'c0fa804a60e206c8347036e6454bb7aee843db8f58bb118be011d82687e33f95',
  'deep-implementation': 'fcaf1792cf56af85505ab9825dde9cf4e0195406a0fd99b4c66e09813a438de0',
  'deep-review': '57ba697ddf13ee636800cce4ac403fa642781806d43600bbeb6d1c053447c444',
};
const header = text => Object.fromEntries(text.split('---')[1].trim().split('\n').map(line => {
  const colon = line.indexOf(':'); return [line.slice(0, colon), line.slice(colon + 1).trim()];
}));
const temporary = t => {
  const directory = fs.mkdtempSync(path.join(root, '.profile-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};
test('canonical profiles have exact models, tools, personal catalogs, fresh context and no delegation', () => {
  for (const [name, [thinking, turns, research, catalog]] of Object.entries(roles)) {
    const text = fs.readFileSync(path.join(root, 'agents', name + '.md'), 'utf8');
    const fields = header(text);
    assert.equal(fields.name, name);
    assert.equal(fields.model, name === 'delegate' ? undefined : 'openai/gpt-6.1-sol');
    assert.equal(fields.thinking, thinking);
    assert.equal(fields.max_turns, String(turns));
    assert.equal(fields.extensions, 'scoped');
    assert.equal(fields.skill_catalog, catalog);
    assert.equal(fields.skills, undefined, 'catalog is not skill auto-bootstrap');
    assert.equal(fields.allowed_subagents, 'none');
    assert.equal(fields['auto-exit'], 'true');
    assert.equal(fields['session-mode'], 'standalone');
    assert.equal(fields.prompt_mode, 'append');
    const tools = ['read', 'grep', 'find', 'ls', ...(['worker', 'delegate'].includes(name) ? ['bash', 'edit', 'write'] : []),
      ...(research ? ['web_search', 'fetch_content', 'get_search_content', 'source_check'] : [])];
    assert.deepEqual(fields.tools.split(', '), tools);
    assert.ok(fields.description.split(/\s+/).length <= 25);
    assert.doesNotMatch(text, /contact_supervisor|watchdog_diff|context7|systemPromptMode|defaultContext|inheritSkills|subagent_agents/);
    assert.match(text, /ask_question/);
    assert.match(text, /Catalog availability is not mandatory invocation or permission/);
    for (const skill of catalog.split(', ')) assert.ok(fs.existsSync(path.join(root, 'pi-skills', skill, 'SKILL.md')));
  }
  assert.ok(!fs.existsSync(path.join(root, 'agents/project-worker.md')));
  assert.deepEqual(fs.readdirSync(path.join(root, 'agents')).filter(name => name.endsWith('.md')).sort(),
    [...Object.keys(roles), 'ui-verifier'].map(name => name + '.md').sort(), 'only eight active specialist profiles may be packaged');
  for (const [name, hash] of Object.entries(aliases)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, 'test/fixtures/legacy-profiles', name + '.md'))).digest('hex'), hash, name);
  }
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'config/subagents.json')));
  assert.deepEqual(policy.delegation, { maxDepth: 2, maxConcurrentDescendants: 6, maxLaunchesPerLineage: null, maxConcurrentChildren: 2 });
});
test('canonical loader gate rejects partial or widened policy without rejecting historical profiles', t => {
  assert.equal(typeof smoke.readCanonicalProfilePolicy, 'function');
  assert.equal(Object.keys(smoke.readCanonicalProfilePolicy(root)).length, 8);
  const directory = temporary(t);
  fs.mkdirSync(path.join(directory, 'agents'));
  assert.equal(smoke.readCanonicalProfilePolicy(directory), null);
  for (const name of Object.keys(aliases)) fs.copyFileSync(path.join(root, 'test/fixtures/legacy-profiles', name + '.md'), path.join(directory, 'agents', name + '.md'));
  assert.equal(smoke.readCanonicalProfilePolicy(directory), null);
  fs.writeFileSync(path.join(directory, 'agents/scout.md'), '---\nname: scout\n---\nHistorical scout.\n');
  assert.equal(smoke.readCanonicalProfilePolicy(directory), null, 'historical same-name profiles do not select the new gate');
  assert.throws(() => smoke.readCanonicalProfilePolicy(directory, true), /canonical profile/i);
  fs.cpSync(path.join(root, 'agents'), path.join(directory, 'agents'), { recursive: true });
  fs.cpSync(path.join(root, 'config'), path.join(directory, 'config'), { recursive: true });
  const file = path.join(directory, 'agents/researcher.md');
  const original = fs.readFileSync(file, 'utf8');
  for (const [before, after] of [['extensions: scoped', 'extensions: true'], ['source_check', 'mcp'],
    ['skill_catalog: grounded-citations', 'skills: grounded-citations'], ['allowed_subagents: none', 'allowed_subagents: all'],
    ['session-mode: standalone', 'session-mode: fork'], ['model: openai/gpt-6.1-sol', 'model: openai-codex/gpt-6.1-sol']]) {
    fs.writeFileSync(file, original.replace(before, after));
    assert.throws(() => smoke.readCanonicalProfilePolicy(directory), /canonical profile/i);
  }
  fs.unlinkSync(file);
  assert.throws(() => smoke.readCanonicalProfilePolicy(directory), /canonical profile/i);
  fs.writeFileSync(file, original);
  const policyFile = path.join(directory, 'config/subagents.json');
  const policy = JSON.parse(fs.readFileSync(policyFile)); policy.delegation.maxConcurrentChildren = 3;
  fs.writeFileSync(policyFile, JSON.stringify(policy));
  assert.throws(() => smoke.readCanonicalProfilePolicy(directory), /canonical profile/i);
});
test('installer projects only eight scoped profiles while preserving private profiles and project-worker symlink', t => {
  const directory = temporary(t), home = path.join(directory, 'home'), source = path.join(directory, 'source');
  for (const dir of [home, source, ...['guides', 'skills', 'agents', 'config', 'manifests'].map(name => path.join(source, name))]) fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(root, 'agents'), path.join(source, 'agents'), { recursive: true });
  fs.cpSync(path.join(root, 'config'), path.join(source, 'config'), { recursive: true });
  fs.writeFileSync(path.join(source, 'config/pi.settings.json'), '{}');
  fs.writeFileSync(path.join(source, 'manifests/packages.json'), '{"packages":[]}');
  fs.writeFileSync(path.join(source, 'SYSTEM.md'), 'Fixture policy.\n');
  const personal = path.join(home, '.pi/agent/agents'); fs.mkdirSync(personal, { recursive: true });
  fs.writeFileSync(path.join(personal, 'private.md'), 'Private profile.\n');
  const worker = path.join(personal, 'worker.md'); fs.writeFileSync(worker, 'Private worker.\n');
  const external = path.join(directory, 'project-worker.md'); fs.writeFileSync(external, 'Coordinator owned.\n');
  fs.symlinkSync(external, path.join(personal, 'project-worker.md'));
  const conflicted = plan({ home, source });
  assert.ok(conflicted.conflicts.includes('.pi/agent/agents/worker.md'));
  assert.throws(() => execute(conflicted), /nothing written/);
  assert.equal(fs.readFileSync(worker, 'utf8'), 'Private worker.\n');
  fs.unlinkSync(worker);
  const pending = plan({ home, source }); assert.deepEqual(pending.conflicts, []); execute(pending);
  for (const name of [...Object.keys(roles), 'ui-verifier']) assert.equal(fs.readFileSync(path.join(personal, name + '.md'), 'utf8'), fs.readFileSync(path.join(root, 'agents', name + '.md'), 'utf8'));
  for (const name of Object.keys(aliases)) assert.equal(fs.existsSync(path.join(personal, name + '.md')), false);
  assert.equal(fs.readFileSync(path.join(personal, 'private.md'), 'utf8'), 'Private profile.\n');
  assert.equal(fs.readlinkSync(path.join(personal, 'project-worker.md')), external);
  assert.deepEqual(plan({ home, source }).operations, []);
});
