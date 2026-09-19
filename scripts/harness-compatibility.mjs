import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { spawnSync } from 'node:child_process';

const INVENTORY_SCHEMA = 1;
const MAX_FAILURES = 100;
const digest = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const posix = value => value.replaceAll('\\', '/');
const json = value => JSON.stringify(value, null, 2) + '\n';

function noSymlinkSegments(file) {
  const absolute = path.resolve(file);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symlink path segments are not allowed');
  }
}

// Match releases.mjs:directoryDigest, including safe relative npm binary links.
function nativeDirectoryDigest(root) {
  noSymlinkSegments(root);
  const entries = [];
  const visit = (folder, prefix = '') => {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      const full = path.join(folder, item.name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(full);
        const escaped = path.relative(root, path.resolve(path.dirname(full), target));
        if (path.isAbsolute(target) || escaped === '..' || escaped.startsWith(`..${path.sep}`) || path.isAbsolute(escaped)) {
          throw new Error('Native symlink escapes package prefix');
        }
        entries.push({ path: relative, type: 'symlink', target });
      } else if (stat.isDirectory()) visit(full, relative);
      else if (stat.isFile()) entries.push({ path: relative, type: 'file', size: stat.size, sha256: digest(fs.readFileSync(full)) });
      else throw new Error('Unsupported native prefix entry');
    }
  };
  visit(root);
  return digest(json(entries.sort((a, b) => a.path.localeCompare(b.path))));
}

function readJSON(file, label = path.basename(file)) {
  let value;
  try { noSymlinkSegments(file); value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error(`Invalid or missing ${label}`); }
  if (!object(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function hashFile(file) {
  noSymlinkSegments(file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error(`Expected regular file: ${path.basename(file)}`);
  return digest(fs.readFileSync(file));
}

function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)) {
    throw new Error('Invalid relative inventory path');
  }
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('Invalid relative inventory path');
  return value;
}

function regularFiles(root, prefix = '') {
  if (!fs.existsSync(root)) return [];
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink not allowed in inventory resources: ${relative}`);
    if (entry.isDirectory()) result.push(...regularFiles(file, relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Unsupported inventory resource: ${relative}`);
  }
  return result;
}

function packageEntrypoints(metadata) {
  const declared = metadata.pi?.extensions;
  if (Array.isArray(declared) && declared.length) return declared.map(value => {
    if (typeof value !== 'string') throw new Error(`Invalid extension metadata for ${metadata.name ?? 'package'}`);
    return safeRelative(value.replace(/^\.\//, ''));
  }).sort();
  if (typeof metadata.main === 'string') return [safeRelative(metadata.main.replace(/^\.\//, ''))];
  const rootExport = typeof metadata.exports === 'string' ? metadata.exports
    : metadata.exports?.['.']?.import ?? metadata.exports?.['.']?.default;
  return typeof rootExport === 'string' ? [safeRelative(rootExport.replace(/^\.\//, ''))] : [];
}

export function supportsHarnessInventory(releaseRoot) {
  return ['config/HARNESS-AUTHORITY.md', 'manifests/harness-legacy.json',
    'scripts/harness-compatibility.mjs', 'scripts/verify-compatibility.mjs']
    .every(relative => fs.existsSync(path.join(releaseRoot, ...relative.split('/'))));
}

export function buildHarnessInventory(releaseRoot) {
  const root = path.resolve(releaseRoot);
  if (!supportsHarnessInventory(root)) throw new Error('Release does not support harness inventory');
  const release = readJSON(path.join(root, 'release.json'), 'release manifest');
  if (typeof release.id !== 'string' || typeof release.piVersion !== 'string'
      || typeof release.sourceDigest !== 'string' || !object(release.sources) || !Array.isArray(release.packages)) {
    throw new Error('Invalid release manifest for inventory');
  }

  // Keep this dependency-free digest identical to releases.mjs:manifestDigest.
  if (!Array.isArray(release.files)) throw new Error('Invalid release source inventory');
  const files = release.files.map(({ path: relative, sha256, size, mode, source, gitObject }) => ({
    path: safeRelative(relative), sha256, size, mode, source, gitObject,
  })).sort((a, b) => a.path.localeCompare(b.path));
  const payload = { piVersion: release.piVersion, sources: release.sources, packages: release.packages, files };
  if (release.schemaVersion >= 2) payload.schemaVersion = release.schemaVersion;
  if (digest(json(payload)) !== release.sourceDigest) throw new Error('Release source inventory digest mismatch');
  for (const file of files) {
    if (hashFile(path.join(root, ...file.path.split('/'))) !== file.sha256) {
      throw new Error(`Release source is missing or modified: ${file.path}`);
    }
  }

  const nativePackage = readJSON(path.join(root, 'native/package.json'), 'native package manifest');
  const nativeLock = readJSON(path.join(root, 'native/package-lock.json'), 'native package lock');
  const nativeDependencies = nativePackage.dependencies ?? {};
  if (!object(nativeDependencies) || !object(nativeLock.packages)) throw new Error('Invalid native package metadata');
  if (!object(nativeLock.packages[''] ?? {}) || !isDeepStrictEqual(nativeLock.packages[''].dependencies ?? {}, nativeDependencies)) {
    throw new Error('Native root lock metadata mismatch');
  }
  const npmPackages = Object.entries(nativeDependencies).sort(([a], [b]) => a.localeCompare(b)).map(([name, version]) => {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)) throw new Error('Invalid native package name');
    if (name.toLowerCase() === 'bigpowers') throw new Error('Bigpowers is not allowed in the native package inventory');
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
      throw new Error(`Native package is not pinned exactly: ${name}`);
    }
    const lock = nativeLock.packages[`node_modules/${name}`];
    if (!object(lock) || lock.version !== version) throw new Error(`Native lock mismatch: ${name}`);
    const packageRoot = path.join(root, 'native/node_modules', ...name.split('/'));
    const metadata = readJSON(path.join(packageRoot, 'package.json'), `installed native package ${name}`);
    if (metadata.name !== name || metadata.version !== version) throw new Error(`Installed native package mismatch: ${name}`);
    const entrypoints = packageEntrypoints(metadata);
    if (!entrypoints.length) throw new Error(`Native package has no entrypoint: ${name}`);
    const entrypointHashes = Object.fromEntries(entrypoints.map(relative =>
      [relative, hashFile(path.join(packageRoot, ...relative.split('/')))]));
    return {
      name, version, entrypoints, entrypointHashes,
      packageJsonSha256: hashFile(path.join(packageRoot, 'package.json')),
      lock: { version: lock.version, ...(typeof lock.integrity === 'string' ? { integrity: lock.integrity } : {}) },
    };
  });

  const localPackages = release.packages.map(pkg => {
    if (!object(pkg) || typeof pkg.name !== 'string' || typeof pkg.path !== 'string'
        || typeof pkg.version !== 'string' || typeof pkg.commit !== 'string' || !Array.isArray(pkg.extensions)) {
      throw new Error('Invalid local package inventory');
    }
    safeRelative(pkg.path);
    const packageRoot = path.join(root, ...pkg.path.split('/'));
    const metadata = readJSON(path.join(packageRoot, 'package.json'), `local package ${pkg.name}`);
    if (metadata.name !== pkg.name || metadata.version !== pkg.version) throw new Error(`Local package metadata mismatch: ${pkg.name}`);
    const entrypoints = pkg.extensions.map(value => safeRelative(value)).sort();
    const entrypointHashes = Object.fromEntries(entrypoints.map(relative =>
      [relative, hashFile(path.join(packageRoot, ...relative.split('/')))]));
    return {
      name: pkg.name, version: pkg.version, path: pkg.path, commit: pkg.commit,
      entrypoints, entrypointHashes, packageJsonSha256: hashFile(path.join(packageRoot, 'package.json')),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const resources = [];
  const addResource = (deployedPath, sourcePath, expectedHash) => {
    safeRelative(deployedPath);
    const actual = hashFile(sourcePath);
    if (expectedHash !== undefined && actual !== expectedHash) throw new Error(`Curated resource hash mismatch: ${posix(path.relative(path.join(root, 'pi-skills'), sourcePath))}`);
    resources.push({ path: deployedPath, sha256: actual });
  };
  const curatedPath = path.join(root, 'manifests/curated-skills.json');
  let curatedSkills = [], curatedSource;
  if (fs.existsSync(curatedPath)) {
    const curated = readJSON(curatedPath, 'curated skills manifest');
    const sourceKeys = ['package', 'version', 'repository', 'integrity', 'license'];
    if (curated.schemaVersion !== 1 || !object(curated.source) || !Array.isArray(curated.skills) || !object(curated.files)
        || sourceKeys.some(key => typeof curated.source[key] !== 'string' || !curated.source[key])) {
      throw new Error('Invalid curated skills manifest');
    }
    curatedSkills = [...curated.skills];
    curatedSource = Object.fromEntries(sourceKeys.map(key => [key, curated.source[key]]));
    for (const [relative, expectedHash] of Object.entries(curated.files).sort(([a], [b]) => a.localeCompare(b))) {
      safeRelative(relative);
      if (typeof expectedHash !== 'string' || !/^[0-9a-f]{64}$/.test(expectedHash)) throw new Error(`Invalid curated resource hash: ${relative}`);
      addResource(`.pi/agent/skills/${relative}`, path.join(root, 'pi-skills', ...relative.split('/')), expectedHash);
    }
  }
  for (const section of ['prompts', 'extensions', 'themes']) {
    for (const relative of regularFiles(path.join(root, section))) {
      addResource(`.pi/agent/${section}/${relative}`, path.join(root, section, ...relative.split('/')));
    }
  }
  for (const [deployed, source] of [
    ['.pi/agent/HARNESS-AUTHORITY.md', 'config/HARNESS-AUTHORITY.md'],
    ['.pi/agent/scripts/harness-compatibility.mjs', 'scripts/harness-compatibility.mjs'],
    ['.pi/agent/scripts/verify-compatibility.mjs', 'scripts/verify-compatibility.mjs'],
  ]) addResource(deployed, path.join(root, ...source.split('/')));
  resources.sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(resources.map(item => item.path)).size !== resources.length) throw new Error('Duplicate inventory resource');

  return {
    schemaVersion: INVENTORY_SCHEMA,
    release: {
      id: release.id, piVersion: release.piVersion, sourceDigest: release.sourceDigest,
      sources: Object.fromEntries(Object.entries(release.sources).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, value.commit])),
    },
    native: {
      directorySha256: nativeDirectoryDigest(path.join(root, 'native')),
      packageJsonSha256: hashFile(path.join(root, 'native/package.json')),
      packageLockSha256: hashFile(path.join(root, 'native/package-lock.json')),
      packages: npmPackages,
    },
    localPackages,
    curatedSource,
    curatedSkills,
    resources,
  };
}

function versionEnvironment(home, environment) {
  const allowed = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'LANG', 'LC_ALL', 'TERM'];
  const result = Object.fromEntries(allowed.filter(key => typeof environment[key] === 'string').map(key => [key, environment[key]]));
  result.HOME = home;
  result.USERPROFILE = home;
  result.PI_OFFLINE = '1';
  result.PI_E2E_LIVE = '0';
  result.PI_TELEMETRY = '0';
  result.NO_PROXY = '*';
  result.no_proxy = '*';
  return result;
}

export function verifyHarnessCompatibility({ home = os.homedir(), spawn = spawnSync, environment = process.env } = {}) {
  const resolvedHome = path.resolve(home);
  const failures = [], checks = [];
  const check = (condition, message) => {
    checks.push({ ok: Boolean(condition), message });
    if (!condition && failures.length < MAX_FAILURES) failures.push(message);
  };
  let state, settings, expected, recorded, releaseRoot;
  try { state = readJSON(path.join(resolvedHome, '.agent-config/state.json'), 'installer state'); }
  catch (error) { failures.push(error.message); }
  try { settings = readJSON(path.join(resolvedHome, '.pi/agent/settings.json'), 'Pi settings'); }
  catch (error) { failures.push(error.message); }
  if (state) {
    const stateValid = state.version === 1
      && typeof state.release === 'string'
      && /^h-[0-9a-f]{12}-s-[0-9a-f]{12}-m-[0-9a-f]{12}$/.test(state.release)
      && typeof state.nativeDigest === 'string' && /^[0-9a-f]{64}$/.test(state.nativeDigest)
      && object(state.files)
      && Object.entries(state.files).every(([relative, hash]) => !path.isAbsolute(relative)
        && !relative.split(/[\\/]/).some(part => part === '..')
        && typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash));
    check(stateValid, 'Installer state is malformed');
    if (stateValid) {
      releaseRoot = path.join(resolvedHome, '.agent-config', 'releases', state.release);
      try {
        expected = buildHarnessInventory(releaseRoot);
        check(expected.release.id === state.release, 'Active release identity does not match installer state');
      } catch (error) { failures.push(error.message); }
    }
  }
  try { recorded = readJSON(path.join(resolvedHome, '.pi/agent/harness-manifest.json'), 'deployed harness inventory'); }
  catch (error) { failures.push(error.message); }
  if (expected && recorded) check(isDeepStrictEqual(recorded, expected), 'Deployed harness inventory is stale or modified');

  const packageSource = entry => typeof entry === 'string' ? entry : entry?.source;
  if (settings) {
    check(Array.isArray(settings.packages), 'Pi settings packages must be an array');
    if (Array.isArray(settings.packages) && expected) {
      const sources = settings.packages.map(packageSource);
      check(sources.every(source => typeof source === 'string'), 'Pi settings contain an invalid package entry');
      const managed = [...expected.localPackages, ...expected.native.packages];
      const identities = sources.map(source => {
        if (typeof source !== 'string') return undefined;
        const npm = source.match(/^npm:((?:@[^/]+\/)?[^@]+)(?:@.*)?$/);
        if (npm) return npm[1];
        if (/^[a-z]+:/i.test(source)) return undefined;
        const resolved = source.startsWith('~/') ? path.join(resolvedHome, source.slice(2))
          : path.resolve(path.join(resolvedHome, '.pi/agent'), source);
        const known = managed.find(pkg => posix(resolved).endsWith(`/packages/${pkg.name}`));
        if (known) return known.name;
        try { return readJSON(path.join(resolved, 'package.json')).name; } catch { return undefined; }
      });
      for (const pkg of managed) check(identities.filter(name => name === pkg.name).length === 1,
        `${pkg.name}: duplicate or missing managed package identity`);
      for (const pkg of expected.localPackages) {
        const wanted = posix(path.join(releaseRoot, ...pkg.path.split('/')));
        check(sources.filter(source => typeof source === 'string' && posix(path.resolve(path.join(resolvedHome, '.pi/agent'), source)) === wanted).length === 1,
          `${pkg.name}: active settings source mismatch`);
      }
      for (const pkg of expected.native.packages) {
        const wanted = `npm:${pkg.name}@${pkg.version}`;
        check(sources.filter(source => source === wanted).length === 1, `${pkg.name}: active npm pin mismatch`);
      }
      check(!sources.some(source => typeof source === 'string' && /^npm:bigpowers(?:@|$)/i.test(source)), 'Bigpowers is present in Pi settings');
      const tasks = expected.localPackages.find(pkg => pkg.name === '@tintinweb/pi-tasks');
      const carbonTasks = expected.resources.some(resource => resource.path === '.pi/agent/extensions/carbon-tasks/index.ts');
      if (tasks && carbonTasks) {
        const taskRoot = posix(path.join(releaseRoot, ...tasks.path.split('/')));
        const matches = settings.packages.filter(entry => {
          const source = packageSource(entry);
          return typeof source === 'string' && posix(path.resolve(path.join(resolvedHome, '.pi/agent'), source)) === taskRoot;
        });
        check(matches.length === 1 && object(matches[0]) && isDeepStrictEqual(matches[0].extensions, []),
          'Task package entrypoint suppression is missing or duplicated');
      }
    }
  }

  if (expected) {
    const agentRoot = path.join(resolvedHome, '.pi', 'agent');
    for (const resource of expected.resources) {
      const deployed = path.join(resolvedHome, ...resource.path.split('/'));
      let actual;
      try { actual = hashFile(deployed); } catch {}
      check(actual === resource.sha256, `Managed resource is missing or modified: ${resource.path}`);
      check(state?.files?.[resource.path] === resource.sha256, `Installer state is stale for resource: ${resource.path}`);
    }
    let inventoryHash;
    try { inventoryHash = hashFile(path.join(agentRoot, 'harness-manifest.json')); } catch {}
    check(state?.files?.['.pi/agent/harness-manifest.json'] === inventoryHash, 'Installer state is stale for deployed harness inventory');

    let deployedNativeDigest;
    try { deployedNativeDigest = nativeDirectoryDigest(path.join(agentRoot, 'npm')); } catch {}
    check(deployedNativeDigest === expected.native.directorySha256, 'Deployed native prefix integrity mismatch');
    check(state?.nativeDigest === expected.native.directorySha256, 'Installer native digest is stale or malformed');
    let nativePackage, nativeLock;
    try { nativePackage = readJSON(path.join(agentRoot, 'npm/package.json'), 'deployed native package manifest'); }
    catch (error) { failures.push(error.message); }
    try { nativeLock = readJSON(path.join(agentRoot, 'npm/package-lock.json'), 'deployed native package lock'); }
    catch (error) { failures.push(error.message); }
    if (nativePackage && nativeLock) {
      check(hashFile(path.join(agentRoot, 'npm/package.json')) === expected.native.packageJsonSha256, 'Deployed native package manifest mismatch');
      check(hashFile(path.join(agentRoot, 'npm/package-lock.json')) === expected.native.packageLockSha256, 'Deployed native package lock mismatch');
      check(!Object.hasOwn(nativePackage.dependencies ?? {}, 'bigpowers'), 'Bigpowers is present in the native package manifest');
      check(!Object.hasOwn(nativeLock.packages ?? {}, 'node_modules/bigpowers'), 'Bigpowers is present in the native package lock');
      check(!fs.existsSync(path.join(agentRoot, 'npm/node_modules/bigpowers')), 'Bigpowers is installed in the native prefix');
      for (const pkg of expected.native.packages) {
        const packageRoot = path.join(agentRoot, 'npm/node_modules', ...pkg.name.split('/'));
        let metadata;
        try { metadata = readJSON(path.join(packageRoot, 'package.json'), `deployed native package ${pkg.name}`); }
        catch (error) { failures.push(error.message); continue; }
        check(metadata.name === pkg.name && metadata.version === pkg.version, `${pkg.name}: deployed version mismatch`);
        check(hashFile(path.join(packageRoot, 'package.json')) === pkg.packageJsonSha256, `${pkg.name}: deployed metadata mismatch`);
        const lock = nativeLock.packages?.[`node_modules/${pkg.name}`];
        check(lock?.version === pkg.lock.version && (pkg.lock.integrity === undefined || lock?.integrity === pkg.lock.integrity),
          `${pkg.name}: deployed lock metadata mismatch`);
        for (const [entrypoint, sha256] of Object.entries(pkg.entrypointHashes)) {
          let actual;
          try { actual = hashFile(path.join(packageRoot, ...entrypoint.split('/'))); } catch {}
          check(actual === sha256, `${pkg.name}: deployed entrypoint mismatch`);
        }
      }
    }
    let pi;
    try {
      pi = spawn('pi', ['--version'], {
        encoding: 'utf8', shell: false, timeout: 10_000, env: versionEnvironment(resolvedHome, environment),
      });
    } catch {}
    const output = pi?.status === 0 ? String(pi.stdout ?? '').trim() : '';
    const detected = output.match(/(?:^|\s)(\d+\.\d+\.\d+)(?:\s|$)/)?.[1];
    check(detected === expected.release.piVersion, `Pi version does not match release ${expected.release.piVersion}`);
  }
  return { ok: failures.length === 0, failures: failures.slice(0, MAX_FAILURES), checks, inventory: expected };
}

export function inventoryJSON(inventory) { return json(inventory); }
