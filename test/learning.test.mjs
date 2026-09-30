import { test, after } from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, symlink, lstat, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../extensions/learning/store.mjs';

const skill = (name, rule = 'Run the test before recommending the procedure.') => `---\nname: ${name}\ndescription: Reusable tested workflow for a class of local tasks.\n---\n\n# Procedure\n\n${rule}\n`;
const homes = [];
const home = async () => { const dir = await mkdtemp(join(tmpdir(), 'pi-learning-')); homes.push(dir); return dir; };
after(async () => { for (const dir of homes) await rm(dir, { recursive: true, force: true }); });
const proposal = (name, content = skill(name)) => ({ name, content, summary: 'Tested procedure for the task class', evidence: 'The current conversation ran the test and verified its result.', sessionId: 'session-123', cwd: '/work/project' });

test('stage, reload, approve, update pinned version; stale update is refused', async () => {
  const dir = await home();
  const first = createStore(dir);
  const { id } = await first.stage(proposal('learned-build'));
  const second = createStore(dir);
  const review = await second.get(id);
  assert.equal(review.content, skill('learned-build'));
  assert.equal(review.sessionId, 'session-123');
  assert.equal((await lstat(join(dir, 'learning', 'pending', `${id}.json`))).mode & 0o777, 0o600);
  const path = join(dir, 'skills', 'learned', 'learned-build', 'SKILL.md');
  assert.equal(await second.approve(id, review.digest), path);
  assert.equal(await readFile(path, 'utf8'), review.content);
  assert.equal((await lstat(path)).mode & 0o777, 0o600);
  assert.equal((await lstat(join(dir, 'skills', 'learned', 'learned-build'))).mode & 0o777, 0o700);
  assert.deepEqual(await first.list(), []);
  const newContent = skill('learned-build', 'Run the focused tests and confirm the successful output.');
  const updated = await first.stage(proposal('learned-build', newContent));
  await writeFile(path, skill('learned-build', 'Other revision.'));
  await assert.rejects(second.approve(updated.id, (await second.get(updated.id)).digest), /stale|ownership|changed/i);
  assert.equal((await second.get(updated.id)).content, newContent);
});

test('reject only known valid pending records; corrupt and swapped records fail closed', async () => {
  const dir = await home(); const store = createStore(dir);
  await assert.rejects(store.reject('bad/../../id'), /id/i);
  await assert.rejects(store.reject('a'.repeat(24)), /unknown/i);
  const { id } = await store.stage(proposal('learned-review'));
  const path = join(dir, 'learning', 'pending', `${id}.json`);
  const before = await store.get(id);
  const changed = JSON.parse(await readFile(path, 'utf8'));
  changed.content = skill('learned-review', 'Never run tests.');
  await writeFile(path, JSON.stringify(changed));
  await assert.rejects(store.approve(id, before.digest), /corrupt|changed/i);
  await assert.rejects(store.reject(id), /corrupt/i);
  assert.equal((await readdir(join(dir, 'learning', 'pending'))).length, 1);
});

test('traversal, unsafe text, existing unowned target and symlink redirects are refused', async () => {
  const dir = await home(); const store = createStore(dir);
  for (const name of ['../escape', 'Learned-Bad', 'learned-x/../x']) await assert.rejects(store.stage(proposal(name)), /name|invalid/i);
  await assert.rejects(store.stage(proposal('learned-ok', skill('learned-ok') + '\u202e')), /unsafe|control/i);
  await assert.rejects(store.stage(proposal('learned-ok', skill('learned-ok') + 'api_key = "sk_test_abcd123456789012345678901234"')), /secret/i);
  await assert.rejects(store.stage(proposal('learned-ok', skill('learned-ok') + 'sk-proj-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')), /secret/i);
  for (const description of ['false', 'null', 'broken: mapping', '|', '>']) {
    const content = skill('learned-ok').replace('Reusable tested workflow for a class of local tasks.', description);
    await assert.rejects(store.stage(proposal('learned-ok', content)), /description|frontmatter/i);
  }
  const ancestor = await home();
  await mkdir(join(ancestor, 'real', 'agent'), { recursive: true });
  await symlink(join(ancestor, 'real'), join(ancestor, 'alias'));
  await assert.rejects(createStore(join(ancestor, 'alias', 'agent')).stage(proposal('learned-parent')), /symlink|unsafe/i);
  const target = join(dir, 'skills', 'learned', 'learned-owned');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'SKILL.md'), skill('learned-owned'));
  await assert.rejects(store.stage(proposal('learned-owned')), /owned|unowned/i);
  const stage = await store.stage(proposal('learned-new'));
  const elsewhere = await home();
  await symlink(elsewhere, join(dir, 'skills', 'learned', 'learned-new'));
  await assert.rejects(store.approve(stage.id, (await store.get(stage.id)).digest), /symlink|unsafe directory|target|exists/i);
  const pending = await store.stage(proposal('learned-pending'));
  await writeFile(join(dir, 'learning', 'pending', `${pending.id}.json`), '{}');
  await assert.rejects(store.get(pending.id), /corrupt/i);
});

test('interrupted publication stays valid and approval can resume after recovery', async () => {
  const dir = await home(); const store = createStore(dir);
  const first = await store.stage(proposal('learned-publish'));
  const firstRecord = await store.get(first.id);
  const target = join(dir, 'skills', 'learned', 'learned-publish', 'SKILL.md');
  const originalWrite = fs.writeFileSync;
  fs.writeFileSync = (path, ...args) => {
    if (String(path).endsWith('.learning-owner.json')) throw new Error('injected marker failure');
    return originalWrite(path, ...args);
  };
  syncBuiltinESMExports();
  try { await assert.rejects(store.approve(first.id, firstRecord.digest), /injected/); }
  finally { fs.writeFileSync = originalWrite; syncBuiltinESMExports(); }
  assert.equal(fs.existsSync(target), false, 'An incomplete skill must not be discoverable');
  await store.approve(first.id, firstRecord.digest);
  const updated = await store.stage(proposal('learned-publish', skill('learned-publish', 'New verified procedure.')));
  const review = await store.get(updated.id);
  const originalRename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (to === target) throw new Error('injected content rename failure');
    return originalRename(from, to);
  };
  syncBuiltinESMExports();
  try { await assert.rejects(store.approve(updated.id, review.digest), /injected/); }
  finally { fs.renameSync = originalRename; syncBuiltinESMExports(); }
  assert.equal(await readFile(target, 'utf8'), firstRecord.content);
  await createStore(dir).approve(updated.id, review.digest);
  assert.equal(await readFile(target, 'utf8'), review.content);
  const last = await store.stage(proposal('learned-publish', skill('learned-publish', 'Final verified procedure.')));
  const lastReview = await store.get(last.id);
  const originalUnlink = fs.unlinkSync;
  fs.unlinkSync = path => {
    if (path === join(dir, 'learning', 'pending', `${last.id}.json`)) throw new Error('injected cleanup failure');
    return originalUnlink(path);
  };
  syncBuiltinESMExports();
  try { await assert.rejects(store.approve(last.id, lastReview.digest), /injected/); }
  finally { fs.unlinkSync = originalUnlink; syncBuiltinESMExports(); }
  await createStore(dir).approve(last.id, lastReview.digest);
  assert.equal(await readFile(target, 'utf8'), lastReview.content);
  assert.deepEqual(await store.list(), []);
});

test('two approvals cannot overwrite the same learned skill', async () => {
  const dir = await home(); const store = createStore(dir);
  const a = await store.stage(proposal('learned-race', skill('learned-race', 'First verified rule.')));
  const b = await store.stage(proposal('learned-race', skill('learned-race', 'Second verified rule.')));
  const results = await Promise.allSettled([store.approve(a.id, (await store.get(a.id)).digest), store.approve(b.id, (await store.get(b.id)).digest)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
});
