import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateRelease } from '../../scripts/releases.mjs';

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const nativePin = '21628a941dbcca3678d659e722b5a8fd10f18105';
const coordinatorPin = '58b02fa776fe4bc0d9aca6ad0b3b3f5a6b9320c4';
const memoryPin = '35275b8ce08a54d3056b1ada578bacb085d53819';
function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function pinned(repo, pin) {
  assert.equal(git(repo, 'rev-parse', 'HEAD'), pin, 'scoped input source provenance mismatch');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'scoped input source must be clean');
}
const nativeRepository = path.resolve(sourceRoot, '../pi-interactive-subagents');
export function validateNativeExport(directory) {
  const entries = git(nativeRepository, 'ls-tree', '-r', '-z', nativePin).split('\0').filter(Boolean);
  for (const entry of entries) {
    const [metadata, relative] = entry.split('\t');
    const [mode, type, oid] = metadata.split(' ');
    assert(type === 'blob' && ['100644', '100755'].includes(mode), 'unsupported native export entry');
    const file = path.join(directory, relative), stat = fs.lstatSync(file);
    assert(stat.isFile() && (stat.mode & 0o777) === Number.parseInt(mode.slice(3), 8), `native export mode mismatch: ${relative}`);
    const bytes = fs.readFileSync(file);
    const actual = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    assert.equal(actual, oid, `native export bytes mismatch: ${relative}`);
  }
  const files = [];
  const visit = folder => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file); else files.push(file);
    }
  };
  visit(directory);
  assert.equal(files.length, entries.length + (fs.existsSync(path.join(directory, 'node_modules')) ? 1 : 0), 'unexpected native export files');
  if (fs.existsSync(path.join(directory, 'node_modules'))) {
    assert(fs.lstatSync(path.join(directory, 'node_modules')).isSymbolicLink(), 'source export dependencies must be an explicit link');
    assert.equal(fs.realpathSync(path.join(directory, 'node_modules')), fs.realpathSync(path.join(nativeRepository, 'node_modules')));
  }
  return { commit: nativePin, tree: git(nativeRepository, 'rev-parse', `${nativePin}^{tree}`), files: entries.length };
}
export function exportPinnedNative(directory) {
  assert(path.resolve(directory).startsWith(sourceRoot + path.sep), 'source export must stay inside the harness repository');
  fs.mkdirSync(directory);
  const archiveArgs = ['-C', nativeRepository, 'archive', '--format=tar', nativePin];
  const archive = spawnSync('git', archiveArgs, { maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  assert.equal(archive.status, 0, archive.stderr?.toString());
  const extractArgs = ['-xf', '-', '-C', directory];
  const extract = spawnSync('tar', extractArgs, { input: archive.stdout });
  assert.equal(extract.status, 0, extract.stderr?.toString());
  const receipt = validateNativeExport(directory);
  const dependencyPath = path.join(nativeRepository, 'node_modules');
  fs.symlinkSync(dependencyPath, path.join(directory, 'node_modules'), 'dir');
  validateNativeExport(directory);
  return { ...receipt, dependencyPath, dependencyRealpath: fs.realpathSync(dependencyPath),
    commands: [['git', ...archiveArgs], ['tar', ...extractArgs], ['ln', '-s', dependencyPath, path.join(directory, 'node_modules')]] };
}

export function scopedInputs(env = process.env, { exportDirectory } = {}) {
  const candidateMode = ['PI_SCOPED_CANDIDATE', 'PI_SCOPED_NATIVE', 'PI_SCOPED_BROWSER', 'PI_SCOPED_HARNESS_COMMIT'].some(key => env[key] !== undefined);
  if (candidateMode) {
    assert(env.PI_SCOPED_SOURCE_EXPORT === undefined, 'candidate cannot use source export');
    for (const key of ['PI_SCOPED_CANDIDATE', 'PI_SCOPED_NATIVE', 'PI_SCOPED_BROWSER', 'PI_SCOPED_COORDINATOR', 'PI_RESEARCH_UPSTREAM_PACKAGE']) {
      assert(env[key] && path.isAbsolute(env[key]), `candidate requires absolute ${key}`);
    }
    assert(/^[0-9a-f]{40}$/.test(env.PI_SCOPED_HARNESS_COMMIT ?? ''), 'candidate requires exact PI_SCOPED_HARNESS_COMMIT');
  }
  const coordinator = env.PI_SCOPED_COORDINATOR ?? path.resolve(sourceRoot, '../pi-project-sessions-coordinator');
  pinned(coordinator, coordinatorPin);
  const coordinatorFiles = git(coordinator, 'ls-files', '-z').split('\0').filter(Boolean);
  if (!candidateMode) {
    let native = nativeRepository, provenance;
    if (env.PI_SCOPED_SOURCE_EXPORT !== undefined) {
      assert.equal(env.PI_SCOPED_SOURCE_EXPORT, '1', 'source export requires explicit opt-in');
      assert(exportDirectory, 'source export needs a disposable fixture directory');
      provenance = exportPinnedNative(exportDirectory); native = exportDirectory;
    } else pinned(native, nativePin);
    assert(env.PI_BROWSER_DEPENDENCIES && env.PI_RESEARCH_UPSTREAM_PACKAGE, 'Supply existing browser dependencies and pinned research package');
    return { mode: 'source', provenance, harness: sourceRoot, native: path.join(native, 'pi-extension/subagents'),
      browser: path.join(sourceRoot, 'vendor/pi-browser'), browserDependencies: env.PI_BROWSER_DEPENDENCIES,
      bridge: path.join(sourceRoot, 'extensions/research-tools/index.ts'), upstream: env.PI_RESEARCH_UPSTREAM_PACKAGE, coordinator, coordinatorFiles };
  }
  const candidate = path.resolve(env.PI_SCOPED_CANDIDATE);
  const reportFile = path.join(candidate, '.release/verification.json');
  const verified = fs.existsSync(reportFile) && JSON.parse(fs.readFileSync(reportFile)).status === 'passed';
  const release = validateRelease({ home: path.resolve(candidate, '../../..'), id: path.basename(candidate), requireDependencies: true, requireVerified: verified });
  assert.equal(release.path, candidate, 'candidate must use the official release layout');
  assert.equal(release.manifest.sources.harness.commit, env.PI_SCOPED_HARNESS_COMMIT, 'candidate harness provenance mismatch');
  assert.equal(release.manifest.sources.subagents.commit, nativePin, 'candidate native provenance mismatch');
  assert.equal(release.manifest.sources.memory.commit, memoryPin, 'candidate memory provenance mismatch');
  const packagePath = name => {
    const pkg = release.manifest.packages.find(p => p.name === name);
    assert(pkg, `candidate missing ${name}`); return path.join(candidate, pkg.path);
  };
  for (const file of ['test/fixtures/scoped-inputs.mjs', 'test/fixtures/scoped-integration.mjs', 'test/fixtures/scoped-host.mjs', 'test/fixtures/scoped-provider.mjs', 'scripts/runtime-smoke.mjs', 'scripts/releases.mjs']) {
    const committed = spawnSync('git', ['-C', sourceRoot, 'show', env.PI_SCOPED_HARNESS_COMMIT + ':' + file], { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    assert.equal(committed.status, 0, committed.stderr?.toString());
    assert.deepEqual(fs.readFileSync(path.join(sourceRoot, file)), committed.stdout, 'candidate fixture runner differs from pinned harness source');
  }
  const native = path.join(packagePath('pi-interactive-subagents'), 'pi-extension/subagents');
  const browser = packagePath('pi-browser');
  const upstream = path.join(candidate, 'native/node_modules/pi-web-access');
  for (const [given, expected] of [[env.PI_SCOPED_NATIVE, native], [env.PI_SCOPED_BROWSER, browser], [env.PI_RESEARCH_UPSTREAM_PACKAGE, upstream],
    ...(env.PI_BROWSER_DEPENDENCIES ? [[env.PI_BROWSER_DEPENDENCIES, path.join(browser, 'node_modules')]] : [])]) {
    assert.equal(path.resolve(given), expected, 'candidate path mismatch: adjacent sources are forbidden');
    assert(fs.realpathSync(expected).startsWith(candidate + path.sep), 'candidate path escapes release');
  }
  const bridge = path.join(candidate, 'extensions/research-tools/index.ts');
  assert(release.manifest.files.some(f => f.path === 'agents/LICENSE.nicobailon'), 'candidate scoped profiles missing');
  assert(release.manifest.files.some(f => f.path === 'extensions/research-tools/index.ts'), 'candidate research bridge missing');
  return { mode: 'candidate', harness: candidate, native, browser, bridge, upstream, coordinator, coordinatorFiles,
    provenance: { release: release.id, sourceDigest: release.manifest.sourceDigest, runtimeDigest: release.dependencies.runtimeDigest, officialVerification: verified } };
}
