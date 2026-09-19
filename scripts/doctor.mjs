import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { root, args, plan, readJSON } from './install.mjs';
import { supportsHarnessInventory, verifyHarnessCompatibility } from './harness-compatibility.mjs';

export function dependencyInstalled(folder, name) {
  try { return readJSON(path.join(folder, 'node_modules', ...name.split('/'), 'package.json')).name === name; }
  catch { return false; }
}
const PI_HOST_ALIASES = new Set([
  '@earendil-works/pi-coding-agent', '@earendil-works/pi-agent-core', '@earendil-works/pi-ai', '@earendil-works/pi-tui',
  '@mariozechner/pi-coding-agent', '@mariozechner/pi-agent-core', '@mariozechner/pi-ai', '@mariozechner/pi-tui',
  'typebox', '@sinclair/typebox',
]);
export function runtimeDependencyNames(meta, { reducedRuntime = false } = {}) {
  if (!reducedRuntime) return Object.keys({ ...meta.peerDependencies, ...meta.dependencies });
  const nonHostPeers = Object.fromEntries(Object.entries(meta.peerDependencies ?? {}).filter(([name]) => !PI_HOST_ALIASES.has(name)));
  return Object.keys({ ...nonHostPeers, ...meta.dependencies });
}
export function inspect({ home, source = root, release, checkRuntime = true, withRtk = false, migratePackages = false, retireOrcaSkills = false, migrateBase = false, spawn = spawnSync }) {
  const checks = [];
  const add = (ok, message) => checks.push({ ok, message });
  try {
    const pending = plan({ home, source, release, withRtk, migratePackages, retireOrcaSkills, migrateBase });
    source = pending.source;
    release = pending.release;
    if (release) add(true, `Release ${release}: integrity and verification valid`);
    else add(false, 'Verified release selection: missing; installation requires an explicit verified release');
    add(pending.conflicts.length === 0, `Conflicts: ${pending.conflicts.length}`);
    for (const item of pending.conflicts) add(false, item);
    add(pending.operations.length === 0, `Pending configuration writes: ${pending.operations.length}`);
  } catch (error) { add(false, error.message); return checks; }
  try {
    const statePath = path.join(home, '.agent-config/state.json');
    if (fs.existsSync(statePath)) {
      const active = readJSON(statePath).release;
      const activeRoot = typeof active === 'string' ? path.join(home, '.agent-config/releases', active) : undefined;
      if (activeRoot && supportsHarnessInventory(activeRoot)) {
        const compatibility = verifyHarnessCompatibility({ home, spawn });
        add(compatibility.ok, `Harness compatibility: ${compatibility.ok ? 'valid' : `${compatibility.failures.length} failure(s)`}`);
        for (const failure of compatibility.failures) add(false, `Harness compatibility: ${failure}`);
      }
    }
  } catch (error) { add(false, `Harness compatibility: ${error.message}`); }
  const manifest = readJSON(path.join(source, 'manifests/packages.json'));
  let reducedRuntime = false;
  if (release) {
    try { reducedRuntime = readJSON(path.join(source, '.release/dependencies.json')).schemaVersion === 2; } catch {}
  }
  for (const pkg of manifest.packages) {
    const folder = path.join(source, pkg.path);
    const meta = readJSON(path.join(folder, 'package.json'));
    add(meta.version === pkg.version, `${pkg.name}: snapshot version ${meta.version}`);
    for (const entry of pkg.extensions) add(fs.existsSync(path.join(folder, entry)), `${pkg.name}: ${entry}`);
    if (checkRuntime) {
      for (const name of runtimeDependencyNames(meta, { reducedRuntime })) {
        const installed = dependencyInstalled(folder, name);
        add(installed, `${pkg.name}: ${installed ? 'dependency' : 'missing dependency'} ${name}`);
      }
    }
  }
  if (checkRuntime) {
    const pi = spawn('pi', ['--version'], { encoding: 'utf8', timeout: 10000, shell: process.platform === 'win32' });
    const version = pi.stdout?.trim() ?? '';
    const detected = version.match(/(?:^|\s)(\d+\.\d+\.\d+)(?:\s|$)/)?.[1];
    add(pi.status === 0 && detected === manifest.piVersion, `Pi expected ${manifest.piVersion}; detected ${version || 'unavailable'}`);
  }
  return checks;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = args(process.argv.slice(2));
    if (options.apply) throw new Error('Doctor is read-only; --apply is not supported');
    const checks = inspect(options);
    for (const item of checks) console.log(`${item.ok ? 'OK' : 'FAIL'} ${item.message}`);
    console.log('Not checked: authentication, live models, interactive UI, optional Python/browser runtimes.');
    if (checks.some(item => !item.ok)) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
