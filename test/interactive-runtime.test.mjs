import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { exportPinnedNative } from './fixtures/scoped-inputs.mjs';
import { identifyInstalledPiHost, runtimeEnvironment, runInteractiveIntegration } from '../scripts/runtime-smoke.mjs';

const root = path.resolve(import.meta.dirname, '..');
for (const historical of [false, true]) test(`${historical ? 'historical legacy' : 'eight scoped'} packaged profiles launch official Pi TUI children under an isolated offline process override`, { timeout: 180000 }, t => {
  const work = fs.mkdtempSync(path.join(root, '.interactive-candidate-fixture-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const source = path.join(work, 'native-export');
  exportPinnedNative(source);
  const releasePath = path.join(work, 'candidate');
  const home = path.join(work, 'home'), agentDir = path.join(home, '.pi/agent');
  const cwd = path.join(work, 'cwd'), temp = path.join(work, 'tmp');
  for (const dir of [releasePath, agentDir, cwd, temp]) fs.mkdirSync(dir, { recursive: true });
  for (const dir of ['agents', 'config']) fs.cpSync(path.join(root, dir), path.join(releasePath, dir), { recursive: true });
  for (const name of ['Explore', 'Plan', 'general-purpose', 'deep-implementation', 'deep-review']) fs.rmSync(path.join(releasePath, 'agents', name + '.md'), { force: true });
  if (historical) for (const name of ['Explore', 'Plan', 'general-purpose', 'deep-implementation', 'deep-review']) fs.copyFileSync(path.join(root, 'test/fixtures/legacy-profiles', name + '.md'), path.join(releasePath, 'agents', name + '.md'));
  const packaged = path.join(releasePath, 'packages/pi-interactive-subagents');
  fs.mkdirSync(packaged, { recursive: true });
  for (const entry of ['package.json', 'pi-extension', 'config.json.example', 'agents']) fs.cpSync(path.join(source, entry), path.join(packaged, entry), { recursive: true });
  // Fixture dependencies are already installed locally; no installation or source entrypoint import.
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(packaged, 'node_modules'), 'dir');
  const supervisor = path.join(releasePath, 'packages/pi-supervisor');
  fs.cpSync(path.join(root, 'vendor/pi-supervisor'), supervisor, { recursive: true, filter: file => !file.split(path.sep).includes('node_modules') });
  fs.cpSync(path.join(releasePath, 'agents'), path.join(agentDir, 'agents'), { recursive: true });
  fs.copyFileSync(path.join(releasePath, 'config/subagents.json'), path.join(agentDir, 'subagents.json'));
  fs.copyFileSync(path.join(releasePath, 'config/SUPERVISOR.md'), path.join(agentDir, 'SUPERVISOR.md'));
  const cache = path.join(process.env.HOME, '.agent-config/releases', JSON.parse(fs.readFileSync(path.join(root, 'manifests/active-release.json'))).release);
  const browser = path.join(releasePath, 'packages/pi-browser');
  fs.cpSync(path.join(root, 'vendor/pi-browser'), browser, { recursive: true, filter: file => !file.split(path.sep).includes('node_modules') });
  fs.symlinkSync(path.join(cache, 'packages/pi-browser/node_modules'), path.join(browser, 'node_modules'), 'dir');
  fs.cpSync(path.join(root, 'extensions/research-tools'), path.join(agentDir, 'extensions/research-tools'), { recursive: true });
  fs.cpSync(path.join(root, 'pi-skills'), path.join(agentDir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(releasePath, 'native'), { recursive: true });
  fs.copyFileSync(path.join(root, 'native/package.json'), path.join(releasePath, 'native/package.json'));
  fs.symlinkSync(path.join(cache, 'native/node_modules'), path.join(releasePath, 'native/node_modules'), 'dir');
  fs.copyFileSync(path.join(root, 'config/web-search.json'), path.join(agentDir, 'web-search.json'));
  const settings = { packages: [packaged, supervisor, browser], extensions: ['-builtin:mcp'] };
  fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify(settings));
  const manifest = { piVersion: '1.5.0', packages: [{ name: 'pi-interactive-subagents', path: 'packages/pi-interactive-subagents' }, { name: 'pi-browser', path: 'packages/pi-browser' }], files: [{ path: 'config/subagents.json' }, { path: 'agents/LICENSE.nicobailon' }] };
  const env = runtimeEnvironment({ ...process.env, PI_SUBAGENT_SURFACE_BACKEND: 'herdr', PI_SUBAGENTS_CONFIG: '/not-authority' }, { home, agentDir, cwd, temp });
  const report = runInteractiveIntegration({ releasePath, manifest, host: identifyInstalledPiHost('1.5.0'), env, agentDir, cwd, temp });
  assert.equal(report.mode, 'official-cli-faux-model-integration');
  assert.equal(report.networkModelCalls, 0);
  assert.equal(report.processEvidence.mode, 'official-cli-tui-pty-children');
  assert.equal(report.processEvidence.configuredBackend, 'herdr');
  assert.equal(report.processEvidence.exercisedBackend, 'process');
  assert.equal(report.processEvidence.herdrExercised, false);
  assert.equal(report.processEvidence.profiles.length, historical ? 5 : 8);
  assert.equal(new Set(report.processEvidence.profiles.map(profile => profile.pid)).size, historical ? 5 : 8);
  if (!historical) {
    assert.deepEqual(report.processEvidence.profiles.map(profile => profile.role).sort(), ['scout', 'worker', 'reviewer', 'oracle', 'researcher', 'evidence-auditor', 'delegate', 'ui-verifier'].sort());
    const delegated = report.processEvidence.profiles.find(profile => profile.role === 'delegate');
    assert.equal(delegated.model, 'gpt-6.1-sol');
    assert.equal(delegated.thinking, 'medium');
  }
  fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ ...settings, packages: [packaged, supervisor] }));
  const missingTemp = path.join(work, 'missing-temp'); fs.mkdirSync(missingTemp);
  assert.throws(() => runInteractiveIntegration({ releasePath,
    manifest: { ...manifest, files: [...manifest.files, { path: 'agents/LICENSE.nicobailon' }] },
    host: identifyInstalledPiHost('1.5.0'), env, agentDir, cwd, temp: missingTemp }), /scoped capability/i,
  'new candidates must refuse missing research/browser backing, not accept only legacy launches');
});
