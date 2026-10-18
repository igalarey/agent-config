import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { identifyInstalledPiHost, runtimeEnvironment } from '../scripts/runtime-smoke.mjs';

const VERSION = '1.3.0';
const repo = fileURLToPath(new URL('../', import.meta.url));

test('real SDK delivers only unconsumed subagent completions at the next model boundary', { timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notification-runtime-'));
  try {
    const home = path.join(root, 'home'), agentDir = path.join(home, '.pi', 'agent');
    const cwd = path.join(root, 'cwd'), temp = path.join(root, 'tmp');
    for (const dir of [home, agentDir, cwd, temp]) fs.mkdirSync(dir, { recursive: true });
    const env = { ...runtimeEnvironment(process.env, { home, agentDir, cwd, temp }), PI_E2E_LIVE: '0', JITI_FS_CACHE: path.join(temp, 'jiti') };
    const explicit = process.env.PI_NOTIFICATION_RELEASE_PATH;
    let host, release, pkg;
    try {
      host = identifyInstalledPiHost(VERSION, { env });
      if (explicit !== undefined) {
        assert(explicit.trim(), 'PI_NOTIFICATION_RELEASE_PATH must not be empty');
        release = path.resolve(explicit);
      } else {
        const state = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.agent-config', 'state.json'), 'utf8'));
        assert.equal(typeof state.release, 'string');
        assert.equal(path.basename(state.release), state.release);
        release = path.join(os.homedir(), '.agent-config', 'releases', state.release);
      }
      const metadata = JSON.parse(fs.readFileSync(path.join(release, 'release.json'), 'utf8'));
      if (metadata.piVersion !== VERSION && explicit === undefined) {
        t.skip(`active release targets historical Pi ${metadata.piVersion}; set PI_NOTIFICATION_RELEASE_PATH to a ${VERSION} candidate`);
        return;
      }
      assert.equal(metadata.piVersion, VERSION);
      pkg = metadata.packages.find(entry => entry.name === '@tintinweb/pi-subagents');
      if (!pkg && explicit === undefined) {
        t.skip('optional real subagents package unavailable in active release');
        return;
      }
      assert(pkg, 'release has no real subagents package');
      assert.equal(typeof pkg.commit, 'string');
      assert.equal(typeof pkg.path, 'string');
      const relative = path.relative(release, path.resolve(release, pkg.path));
      assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'package escapes release');
      assert(fs.statSync(path.join(release, pkg.path, 'src/index.ts')).isFile());
      assert(fs.statSync(path.join(release, pkg.path, 'node_modules')).isDirectory());
    } catch (error) {
      if (explicit !== undefined || (error.code !== 'ENOENT' && !error.message.startsWith(`Installed Pi host ${VERSION} was not found`))) throw error;
      t.skip(`optional installed Pi/subagents runtime unavailable: ${error.message}`);
      return;
    }
    const source = path.join(release, pkg.path), fixture = path.join(root, 'subagents');
    fs.mkdirSync(fixture);
    fs.cpSync(path.join(source, 'src'), path.join(fixture, 'src'), { recursive: true });
    fs.copyFileSync(path.join(source, 'package.json'), path.join(fixture, 'package.json'));
    fs.symlinkSync(path.join(source, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
    const overlayFile = path.join(repo, 'manifests', 'subagents-notifications.json');
    if (fs.existsSync(overlayFile)) {
      const overlay = JSON.parse(fs.readFileSync(overlayFile, 'utf8'));
      const index = path.join(fixture, 'src', 'index.ts');
      assert.equal(overlay.schemaVersion, 1);
      assert.equal(overlay.commit, pkg.commit);
      assert.equal(overlay.piVersion, VERSION);
      assert.equal(overlay.path, 'src/index.ts');
      const content = fs.readFileSync(index);
      const sourceHash = createHash('sha256').update(content).digest('hex');
      if (explicit !== undefined) {
        assert.equal(sourceHash, overlay.resultSha256, 'candidate must contain the verified notification source, without fixture patching');
      } else if (sourceHash !== overlay.resultSha256) {
        const { applyNotificationOverlay } = await import('../scripts/releases.mjs');
        fs.writeFileSync(index, applyNotificationOverlay(content, overlay, pkg.commit, VERSION));
      }
    }
    fs.mkdirSync(path.join(agentDir, 'agents'));
    fs.writeFileSync(path.join(agentDir, 'agents', 'notification-child.md'), '---\nname: notification-child\ndescription: Offline notification fixture\ntools: read\nskills: false\nextensions: []\nallowed_subagents: none\nmax_turns: 10\n---\nReturn the requested fixture token without tools.\n');
    fs.copyFileSync(path.join(repo, 'config', 'subagents.json'), path.join(agentDir, 'subagents.json'));
    const run = spawnSync(process.execPath, [path.join(repo, 'test', 'fixtures', 'notification-runtime.mjs'), host.packageRoot, path.join(fixture, 'src', 'index.ts')], {
      env, cwd, encoding: 'utf8', timeout: 50000, shell: false, maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(run.status, 0, run.error?.message ?? `${run.stderr}\n${run.stdout}`);
    assert.equal(run.stderr.trim(), '');
    const report = JSON.parse(run.stdout.trim());
    assert.equal(report.piVersion, VERSION);
    assert.equal(report.networkCalls, 0);
    t.diagnostic(JSON.stringify(report));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
