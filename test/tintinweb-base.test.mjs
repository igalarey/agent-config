import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const json = name => JSON.parse(read(name));

test('new upstream sources are exact reviewed Git commits, not floating branches', () => {
  const manifest = json('manifests/tintinweb.json');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.piVersion, '0.87.1');
  assert.deepEqual(manifest.packages.map(p => p.name), [
    '@tintinweb/pi-subagents', '@tintinweb/pi-tasks', 'pi-supervisor',
  ]);
  const repos = ['pi-subagents', 'pi-tasks', 'pi-supervisor'];
  for (const [index, pkg] of manifest.packages.entries()) {
    assert.equal(pkg.repository, `https://github.com/tintinweb/${repos[index]}.git`);
    assert.match(pkg.commit, /^[0-9a-f]{40}$/);
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  }
});

test('new base disables upstream hook-bypassing worktree automation', () => {
  assert.equal(json('config/subagents.json').worktreeIsolation, false);
});

test('new task state is kept outside repositories and does not auto-cascade', () => {
  assert.deepEqual(json('config/tasks-config.json'), {
    taskScope: 'session-global', autoCascade: false,
  });
});

test('supervisor policy distinguishes steering from human authorization', () => {
  const policy = read('config/SUPERVISOR.md');
  assert.match(policy, /not human authorization/);
  assert.match(policy, /Never supply approval/);
  assert.match(policy, /incomplete\s+required outcome is not done/i);
  assert.match(policy, /"action"/);
  assert.match(policy, /"confidence"/);
  assert.ok(fs.existsSync(fileURLToPath(new URL('docs/changes/tintinweb-base.md', root))));
});
