import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verificationEnvironment } from './verify-env.mjs';
import { runRuntimeSmoke } from './runtime-smoke.mjs';

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const CONTENT_HASH = /^[0-9a-f]{64}$/i;
const validContentHash = value => typeof value === 'string' && CONTENT_HASH.test(value) && !/^0+$/.test(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const RELEASE_META = '.release';
const DEPENDENCIES_REPORT = `${RELEASE_META}/dependencies.json`;
const VERIFICATION_REPORT = `${RELEASE_META}/verification.json`;
const ACTIVATION_SEAL = `${RELEASE_META}/activation.json`;
const DEVELOPMENT_ROOT = `${RELEASE_META}/development`;
const DEPENDENCY_FAILURE_REPORT = `${RELEASE_META}/dependencies.failed.json`;
const DEVELOPMENT_NPM_ARGS = ['ci', '--ignore-scripts', '--include=dev', '--include=optional'];
const RUNTIME_NPM_ARGS = ['ci', '--ignore-scripts', '--omit=dev', '--include=optional'];
const REPORT_SCHEMA = 2;

const SOURCES = {
  harness: {
    entries: [
      'SYSTEM.md', 'config/pi.settings.json', 'manifests/packages.json',
    ],
    optionalEntries: ['config/subagents.json', 'config/tasks-config.json', 'config/SUPERVISOR.md', 'manifests/tintinweb.json', 'manifests/memory-lock-additions.json', 'manifests/subagents-ui.json', 'native/package.json', 'native/package-lock.json', 'config/mcp.json', 'config/web-search.json'],
    prefixes: ['agents/', 'guides/', 'skills/', 'prompts/', 'extensions/', 'themes/', 'vendor/pi-ask-user-question/', 'vendor/pi-web-fetch/', 'vendor/pi-browser/',
      'vendor/pi-mcp/', 'vendor/pi-subscription-usage/', 'vendor/pi-tasks/', 'vendor/pi-supervisor/'],
  },
  subagents: {
    entries: ['LICENSE', 'README.md', 'package.json', 'package-lock.json', 'tsconfig.json'],
    prefixes: ['agents/', 'pi-extension/', 'src/', 'test/', 'docs/', 'examples/'],
    optionalEntries: ['config.json.example', 'vitest.config.ts'],
  },
  memory: {
    entries: ['LICENSE', 'README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts'],
    prefixes: ['agent/', 'src/', 'tests/'],
  },
};

const PACKAGE_SOURCES = [
  { key: 'subagents', expectedName: 'pi-interactive-subagents' },
  { key: 'memory', expectedName: 'observational-memory' },
  { key: 'harness', sourcePrefix: 'vendor/pi-ask-user-question/', expectedName: 'pi-ask-user-question' },
  { key: 'harness', sourcePrefix: 'vendor/pi-web-fetch/', expectedName: 'pi-web-fetch', optional: true },
  { key: 'harness', sourcePrefix: 'vendor/pi-browser/', expectedName: 'pi-browser', optional: true },
  { key: 'harness', sourcePrefix: 'vendor/pi-mcp/', expectedName: 'pi-mcp', optional: true },
  { key: 'harness', sourcePrefix: 'vendor/pi-subscription-usage/', expectedName: 'pi-subscription-usage', optional: true },
  { key: 'harness', sourcePrefix: 'vendor/pi-tasks/', expectedName: '@tintinweb/pi-tasks', optional: true },
  { key: 'harness', sourcePrefix: 'vendor/pi-supervisor/', expectedName: 'pi-supervisor', optional: true },
];

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function readJSON(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!object(value)) throw new Error(`Expected JSON object: ${file}`);
  return value;
}
function noSymlinkSegments(target) {
  for (let current = path.resolve(target); current !== path.dirname(current); current = path.dirname(current)) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink path not allowed: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value) || path.posix.isAbsolute(value)) {
    throw new Error(`Unsafe repository path: ${JSON.stringify(value)}`);
  }
  const reserved = /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[<>:"|?*]/.test(part)
      || part.endsWith('.') || part.endsWith(' ') || reserved.test(part))) {
    throw new Error(`Unsafe repository path: ${JSON.stringify(value)}`);
  }
  return value;
}
function npmExecPath() {
  const candidate = process.env.npm_execpath;
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) throw new Error('npm_execpath must be absolute; run through npm');
  if (!['npm-cli.js', 'npm-cli.cjs', 'npm.js', 'npm.cjs'].includes(path.basename(candidate).toLowerCase())) {
    throw new Error(`Unexpected npm_execpath: ${candidate}`);
  }
  if (!fs.statSync(candidate).isFile()) throw new Error(`npm_execpath is not a file: ${candidate}`);
  return candidate;
}
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { shell: false, maxBuffer: 128 * 1024 * 1024, ...options });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
    throw new Error(`${command} ${commandArgs[0] ?? ''} failed: ${(stderr || result.error?.message || `exit ${result.status}`).trim()}`);
  }
  return result;
}
function git(repo, commandArgs, options = {}) {
  return run('git', ['-C', repo, ...commandArgs], options);
}
function allowed(sourceKey, relative) {
  const spec = SOURCES[sourceKey];
  return spec.entries.includes(relative) || spec.optionalEntries?.includes(relative) || spec.prefixes.some(prefix => relative.startsWith(prefix));
}
function prohibitedSourcePath(relative) {
  const parts = relative.toLowerCase().split('/');
  const leaf = parts.at(-1);
  const sensitiveFiles = new Set([
    '.npmrc', '.netrc', '.pypirc', 'auth.json', 'credentials.json', 'oauth.json',
    'secrets.json', 'token.json', 'tokens.json', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
  ]);
  return parts.some(part => ['.git', '.memory', '.venv', '__pycache__', 'node_modules', 'sessions', 'secrets', 'credentials'].includes(part))
    || sensitiveFiles.has(leaf) || leaf === '.env' || leaf.startsWith('.env.')
    || leaf.endsWith('.pyc') || leaf.endsWith('.pem') || leaf.endsWith('.key');
}
function exactCommit(repo, requested) {
  if (!path.isAbsolute(repo)) throw new Error(`Repository path must be absolute: ${repo}`);
  if (!SHA.test(requested)) throw new Error(`Commit must be a full hexadecimal object id: ${requested}`);
  noSymlinkSegments(repo);
  const actual = git(repo, ['rev-parse', '--verify', `${requested}^{commit}`], { encoding: 'utf8' }).stdout.trim();
  if (actual.toLowerCase() !== requested.toLowerCase()) throw new Error(`Revision is not the exact requested commit: ${requested}`);
  return actual.toLowerCase();
}
function committedFiles(repo, commit, sourceKey) {
  const output = git(repo, ['ls-tree', '-rz', '--full-tree', commit], { encoding: null }).stdout;
  const records = [];
  let tree;
  try { tree = new TextDecoder('utf-8', { fatal: true }).decode(output); }
  catch { throw new Error(`Non-UTF-8 repository path in ${sourceKey}`); }
  for (const raw of tree.split('\0')) {
    if (!raw) continue;
    const tab = raw.indexOf('\t');
    if (tab === -1) throw new Error(`Invalid git tree record in ${sourceKey}`);
    const [mode, type, objectId] = raw.slice(0, tab).split(' ');
    const relative = safeRelative(raw.slice(tab + 1));
    if (!allowed(sourceKey, relative)) continue;
    if (prohibitedSourcePath(relative)) throw new Error(`Prohibited committed source path: ${sourceKey}:${relative}`);
    if (mode === '120000') throw new Error(`Source symlink not allowed: ${sourceKey}:${relative}`);
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) {
      throw new Error(`Unsupported git entry ${mode} ${type}: ${sourceKey}:${relative}`);
    }
    const content = git(repo, ['cat-file', 'blob', objectId], { encoding: null }).stdout;
    records.push({ sourceKey, sourcePath: relative, gitObject: objectId, mode, content });
  }
  return records.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
}
function requireEntry(records, sourceKey, relative) {
  const entry = records.find(item => item.sourceKey === sourceKey && item.sourcePath === relative);
  if (!entry) throw new Error(`Required committed file missing: ${sourceKey}:${relative}`);
  return entry;
}
function parseCommittedJSON(records, sourceKey, relative) {
  const entry = requireEntry(records, sourceKey, relative);
  const value = JSON.parse(entry.content.toString('utf8'));
  if (!object(value)) throw new Error(`Expected JSON object: ${sourceKey}:${relative}`);
  return value;
}
function releaseId(commits) {
  return `h-${commits.harness.slice(0, 12)}-s-${commits.subagents.slice(0, 12)}-m-${commits.memory.slice(0, 12)}`;
}
export function manifestDigest(manifest) {
  const files = manifest.files.map(({ path: relative, sha256, size, mode, source, gitObject }) => ({
    path: relative, sha256, size, mode, source, gitObject,
  })).sort((a, b) => a.path.localeCompare(b.path));
  const payload = { piVersion: manifest.piVersion, sources: manifest.sources, packages: manifest.packages, files };
  if (manifest.schemaVersion >= REPORT_SCHEMA) payload.schemaVersion = manifest.schemaVersion;
  return digest(json(payload));
}
function mappedReleaseFiles(records, commits) {
  const files = [];
  const add = (relative, entry, content = entry.content, source = entry.sourceKey) => {
    safeRelative(relative);
    if (files.some(item => item.path.toLowerCase() === relative.toLowerCase())) throw new Error(`Duplicate or case-ambiguous release path: ${relative}`);
    files.push({
      path: relative,
      content,
      mode: entry.mode,
      source,
      gitObject: entry.gitObject,
      size: content.length,
      sha256: digest(content),
    });
  };

  for (const entry of records.filter(item => item.sourceKey === 'harness')) {
    if (entry.sourcePath.startsWith('vendor/pi-ask-user-question/')) {
      add(`packages/pi-ask-user-question/${entry.sourcePath.slice('vendor/pi-ask-user-question/'.length)}`, entry);
    } else if (entry.sourcePath.startsWith('vendor/pi-web-fetch/')) {
      add(`packages/pi-web-fetch/${entry.sourcePath.slice('vendor/pi-web-fetch/'.length)}`, entry);
    } else if (entry.sourcePath.startsWith('vendor/pi-browser/')) {
      add(`packages/pi-browser/${entry.sourcePath.slice('vendor/pi-browser/'.length)}`, entry);
    } else if (entry.sourcePath.startsWith('vendor/pi-mcp/')) {
      add(`packages/pi-mcp/${entry.sourcePath.slice('vendor/pi-mcp/'.length)}`, entry);
    } else if (entry.sourcePath.startsWith('vendor/pi-subscription-usage/')) {
      add(`packages/pi-subscription-usage/${entry.sourcePath.slice('vendor/pi-subscription-usage/'.length)}`, entry);
    } else if (entry.sourcePath.startsWith('vendor/pi-tasks/')) {
      add(`packages/@tintinweb/pi-tasks/${entry.sourcePath.slice('vendor/pi-tasks/'.length)}`, entry);
    } else if (entry.sourcePath.startsWith('vendor/pi-supervisor/')) {
      add(`packages/pi-supervisor/${entry.sourcePath.slice('vendor/pi-supervisor/'.length)}`, entry);
    } else {
      add(entry.sourcePath, entry);
    }
  }
  const subagentsName = parseCommittedJSON(records, 'subagents', 'package.json').name;
  if (!['pi-interactive-subagents', '@tintinweb/pi-subagents'].includes(subagentsName)) throw new Error('Unexpected subagents package');
  for (const entry of records.filter(item => item.sourceKey === 'subagents')) {
    add(`packages/${subagentsName}/${entry.sourcePath}`, entry);
  }
  for (const entry of records.filter(item => item.sourceKey === 'memory')) {
    add(`packages/observational-memory/${entry.sourcePath}`, entry);
  }

  const memoryPatch = records.find(entry => entry.sourceKey === 'harness' && entry.sourcePath === 'manifests/memory-lock-additions.json');
  if (memoryPatch) {
    const patch = JSON.parse(memoryPatch.content.toString('utf8'));
    const lock = files.find(entry => entry.path === 'packages/observational-memory/package-lock.json');
    if (commits.memory !== patch.commit || !lock || lock.sha256 !== patch.originalSha256) throw new Error('Memory lock patch does not match pinned source');
    const data = JSON.parse(lock.content.toString('utf8'));
    for (const [name, metadata] of Object.entries(patch.packages)) {
      if (Object.hasOwn(data.packages, name)) throw new Error(`Memory lock patch would replace existing entry: ${name}`);
      data.packages[name] = metadata;
    }
    lock.content = Buffer.from(json(data));
    lock.size = lock.content.length;
    lock.sha256 = digest(lock.content);
    lock.source = 'generated';
    lock.gitObject = null;
  }
  const subagentsOverlayEntry = records.find(entry => entry.sourceKey === 'harness' && entry.sourcePath === 'manifests/subagents-ui.json');
  if (subagentsOverlayEntry) {
    const overlay = JSON.parse(subagentsOverlayEntry.content.toString('utf8'));
    const expectedPaths = new Set([
      'src/ui/agent-widget.ts',
      'test/agent-color-surfaces.test.ts',
    ]);
    if (overlay.commit !== commits.subagents || !Array.isArray(overlay.files) || overlay.files.length !== expectedPaths.size) {
      throw new Error('Subagents UI overlay does not match pinned source');
    }
    const seen = new Set();
    for (const patch of overlay.files) {
      if (!object(patch) || !expectedPaths.has(patch.path) || seen.has(patch.path)
        || typeof patch.originalSha256 !== 'string' || !validContentHash(patch.originalSha256)
        || typeof patch.oldText !== 'string' || typeof patch.newText !== 'string' || !patch.oldText || patch.oldText === patch.newText) {
        throw new Error('Invalid subagents UI overlay');
      }
      seen.add(patch.path);
      const target = files.find(entry => entry.path === `packages/${subagentsName}/${patch.path}`);
      if (!target || target.sha256 !== patch.originalSha256) throw new Error('Subagents UI overlay does not match pinned source');
      const text = target.content.toString('utf8');
      const occurrences = text.split(patch.oldText).length - 1;
      if (occurrences !== 1) throw new Error(`Subagents UI overlay replacement is not unique: ${patch.path}`);
      target.content = Buffer.from(text.replace(patch.oldText, patch.newText));
      target.size = target.content.length;
      target.sha256 = digest(target.content);
      target.source = 'generated';
      target.gitObject = null;
    }
    if (seen.size !== expectedPaths.size) throw new Error('Invalid subagents UI overlay');
  }
  const harnessManifest = parseCommittedJSON(records, 'harness', 'manifests/packages.json');
  if (typeof harnessManifest.piVersion !== 'string' || !harnessManifest.piVersion) throw new Error('Harness Pi version is missing');
  const packageSpecs = PACKAGE_SOURCES.map(spec => spec.key === 'subagents' ? { ...spec, expectedName: subagentsName } : spec).filter(spec => !spec.optional
    || harnessManifest.packages?.some(pkg => pkg.name === spec.expectedName)
    || records.some(entry => entry.sourceKey === spec.key && entry.sourcePath.startsWith(spec.sourcePrefix)));
  const packages = packageSpecs.map(spec => {
    const packagePath = spec.sourcePrefix ? `${spec.sourcePrefix}package.json` : 'package.json';
    const metadata = parseCommittedJSON(records, spec.key, packagePath);
    if (metadata.name !== spec.expectedName || typeof metadata.version !== 'string' || !object(metadata.pi) || !Array.isArray(metadata.pi.extensions)) {
      throw new Error(`Invalid package metadata for ${spec.expectedName}`);
    }
    return {
      name: metadata.name,
      path: `packages/${metadata.name}`,
      version: metadata.version,
      source: spec.key,
      commit: commits[spec.key],
      extensions: metadata.pi.extensions.map(value => {
        if (typeof value !== 'string') throw new Error(`Invalid extension path for ${metadata.name}`);
        return value.replace(/^\.\//, '');
      }),
    };
  });
  for (const pkg of packages) {
    for (const extension of pkg.extensions) {
      safeRelative(extension);
      if (!files.some(item => item.path === `${pkg.path}/${extension}`)) throw new Error(`Committed package extension missing: ${pkg.name}:${extension}`);
    }
  }
  const generatedManifest = Buffer.from(json({ piVersion: harnessManifest.piVersion, packages }), 'utf8');
  const oldManifest = files.findIndex(item => item.path === 'manifests/packages.json');
  if (oldManifest !== -1) files.splice(oldManifest, 1);
  add('manifests/packages.json', { mode: '100644', gitObject: null }, generatedManifest, 'generated');
  return { files: files.sort((a, b) => a.path.localeCompare(b.path)), piVersion: harnessManifest.piVersion, packages };
}

export function planRelease({ home, repositories, commits }) {
  const resolvedHome = path.resolve(home);
  if (!object(repositories) || !object(commits)) throw new Error('repositories and commits maps are required');
  const exact = {}, records = [];
  for (const key of Object.keys(SOURCES)) {
    if (typeof repositories[key] !== 'string' || typeof commits[key] !== 'string') throw new Error(`Missing ${key} repository or commit`);
    exact[key] = exactCommit(path.resolve(repositories[key]), commits[key]);
    records.push(...committedFiles(path.resolve(repositories[key]), exact[key], key));
  }
  for (const [key, spec] of Object.entries(SOURCES)) {
    for (const required of spec.entries) requireEntry(records, key, required);
  }
  const built = mappedReleaseFiles(records, exact);
  const id = releaseId(exact);
  const releasePath = path.join(resolvedHome, '.agent-config', 'releases', id);
  noSymlinkSegments(releasePath);
  if (fs.existsSync(releasePath)) throw new Error(`Release already exists: ${id}`);
  const publicFiles = built.files.map(({ content, ...entry }) => entry);
  const manifest = {
    schemaVersion: REPORT_SCHEMA,
    id,
    piVersion: built.piVersion,
    sources: Object.fromEntries(Object.keys(SOURCES).map(key => [key, { commit: exact[key] }])),
    packages: built.packages,
    files: publicFiles,
  };
  manifest.sourceDigest = manifestDigest(manifest);
  return { home: resolvedHome, id, releasePath, files: built.files, manifest };
}

export function executeRelease(plan) {
  noSymlinkSegments(plan.releasePath);
  if (fs.existsSync(plan.releasePath)) throw new Error(`Release already exists: ${plan.id}`);
  const parent = path.dirname(plan.releasePath);
  fs.mkdirSync(parent, { recursive: true });
  noSymlinkSegments(parent);
  const staging = path.join(parent, `.prepare-${plan.id}-${randomUUID()}`);
  try {
    fs.mkdirSync(staging, { mode: 0o700 });
    for (const entry of plan.files) {
      const target = path.join(staging, ...entry.path.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.content, { flag: 'wx', mode: entry.mode === '100755' ? 0o700 : 0o600 });
    }
    fs.writeFileSync(path.join(staging, 'release.json'), json(plan.manifest), { flag: 'wx', mode: 0o600 });
    fs.renameSync(staging, plan.releasePath);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return plan.releasePath;
}

function validateManifestPath(releasePath, relative) {
  safeRelative(relative);
  const target = path.resolve(releasePath, ...relative.split('/'));
  const rel = path.relative(releasePath, target);
  if (rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) throw new Error(`Release path escapes candidate: ${relative}`);
  noSymlinkSegments(target);
  return target;
}
function validateSourceFiles(releasePath, manifest) {
  if (!Array.isArray(manifest.files) || typeof manifest.sourceDigest !== 'string') throw new Error('Invalid release file inventory');
  const seen = new Set();
  for (const entry of manifest.files) {
    if (!object(entry) || seen.has(entry.path)) throw new Error('Invalid or duplicate release file entry');
    seen.add(entry.path);
    const target = validateManifestPath(releasePath, entry.path);
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size !== entry.size || digest(fs.readFileSync(target)) !== entry.sha256) {
      throw new Error(`Release integrity mismatch: ${entry.path}`);
    }
  }
  const actual = new Set();
  const allowedRuntimeModules = new Set(manifest.packages.map(pkg => `${pkg.path}/node_modules`));
  if (manifest.files.some(file => file.path === 'native/package.json')) allowedRuntimeModules.add('native/node_modules');
  const visit = (folder, prefix = '') => {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      const full = path.join(folder, item.name);
      if (item.isSymbolicLink()) throw new Error(`Unexpected release symlink: ${relative}`);
      if (relative === 'release.json') continue;
      if (relative === RELEASE_META) {
        if (!item.isDirectory()) throw new Error(`Unsupported release entry: ${relative}`);
        continue;
      }
      if (item.name === 'node_modules') {
        if (!item.isDirectory() || !allowedRuntimeModules.has(relative)) throw new Error(`Unexpected shared node_modules: ${relative}`);
        continue;
      }
      if (item.isDirectory()) visit(full, relative);
      else if (item.isFile()) actual.add(relative);
      else throw new Error(`Unsupported release entry: ${relative}`);
    }
  };
  visit(releasePath);
  for (const relative of actual) if (!seen.has(relative)) throw new Error(`Unexpected release source file: ${relative}`);
  for (const relative of seen) if (!actual.has(relative)) throw new Error(`Release source file missing: ${relative}`);
  if (manifestDigest(manifest) !== manifest.sourceDigest) throw new Error('Release manifest digest mismatch');
}
function developmentPackagePath(manifest, pkg) {
  const index = manifest.packages.findIndex(item => item.name === pkg.name);
  if (index < 0) throw new Error(`Development package missing from manifest: ${pkg.name}`);
  return `p${index}`;
}
function developmentEntries(manifest) {
  return manifest.packages.flatMap(pkg => {
    const prefix = `${pkg.path}/`;
    const developmentPackage = developmentPackagePath(manifest, pkg);
    return manifest.files.filter(entry => entry.path.startsWith(prefix)).map(entry => ({
      path: `${developmentPackage}/${entry.path.slice(prefix.length)}`,
      sourcePath: entry.path,
      size: entry.size,
      sha256: entry.sha256,
    }));
  }).sort((a, b) => a.path.localeCompare(b.path));
}
function developmentDigest(manifest) {
  return digest(json(developmentEntries(manifest)));
}
function validateDevelopmentTree(releasePath, manifest) {
  const root = validateManifestPath(releasePath, DEVELOPMENT_ROOT);
  const expected = new Map(developmentEntries(manifest).map(entry => [entry.path, entry]));
  const actual = new Set();
  const allowedDevelopmentModules = new Set(manifest.packages.map(pkg => `${developmentPackagePath(manifest, pkg)}/node_modules`));
  const visit = (folder, prefix = '') => {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      const full = path.join(folder, item.name);
      if (item.isSymbolicLink()) throw new Error(`Unexpected development symlink: ${relative}`);
      if (item.name === 'node_modules') {
        if (!item.isDirectory() || !allowedDevelopmentModules.has(relative)) throw new Error(`Unexpected shared development node_modules: ${relative}`);
        continue;
      }
      if (item.isDirectory()) visit(full, relative);
      else if (item.isFile()) actual.add(relative);
      else throw new Error(`Unsupported development entry: ${relative}`);
    }
  };
  visit(root);
  for (const [relative, entry] of expected) {
    const target = path.join(root, ...relative.split('/'));
    if (!actual.has(relative)) throw new Error(`Development source file missing: ${relative}`);
    const stat = fs.statSync(target);
    if (stat.size !== entry.size || digest(fs.readFileSync(target)) !== entry.sha256) throw new Error(`Development integrity mismatch: ${relative}`);
  }
  for (const relative of actual) if (!expected.has(relative)) throw new Error(`Unexpected development source file: ${relative}`);
  return developmentDigest(manifest);
}
function prepareDevelopmentTree(releasePath, manifest) {
  const root = path.join(releasePath, DEVELOPMENT_ROOT);
  noSymlinkSegments(root);
  if (fs.existsSync(root)) {
    validateDevelopmentTree(releasePath, manifest);
    return root;
  }
  const staging = path.join(releasePath, RELEASE_META, `.development-${randomUUID()}`);
  try {
    for (const entry of developmentEntries(manifest)) {
      const source = validateManifestPath(releasePath, entry.sourcePath);
      const target = path.join(staging, ...entry.path.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(target, fs.statSync(source).mode & 0o777);
    }
    fs.renameSync(staging, root);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  validateDevelopmentTree(releasePath, manifest);
  return root;
}
function reportDigest(file) {
  return digest(fs.readFileSync(file));
}
function runtimeEntries(releasePath, manifest) {
  const entries = [];
  const packages = [...manifest.packages];
  if (manifest.files?.some(file => file.path === 'native/package.json')) packages.push({ name: 'native-npm', path: 'native' });
  for (const pkg of packages) {
    const packageRoot = validateManifestPath(releasePath, pkg.path);
    const visit = (folder, prefix = '') => {
      for (const item of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const relative = prefix ? `${prefix}/${item.name}` : item.name;
        const full = path.join(folder, item.name);
        const stat = fs.lstatSync(full);
        if (stat.isSymbolicLink()) {
          const link = fs.readlinkSync(full);
          if (path.isAbsolute(link)) throw new Error(`Absolute runtime symlink not allowed: ${pkg.name}:${relative}`);
          const resolved = path.resolve(path.dirname(full), link);
          const escaped = path.relative(packageRoot, resolved);
          if (escaped === '..' || escaped.startsWith(`..${path.sep}`) || path.isAbsolute(escaped)) {
            throw new Error(`Runtime symlink escapes package: ${pkg.name}:${relative}`);
          }
          entries.push({ path: `${pkg.path}/${relative}`, type: 'symlink', target: link });
        } else if (item.isDirectory()) {
          visit(full, relative);
        } else if (item.isFile()) {
          entries.push({ path: `${pkg.path}/${relative}`, type: 'file', size: stat.size, sha256: digest(fs.readFileSync(full)) });
        } else {
          throw new Error(`Unsupported runtime entry: ${pkg.name}:${relative}`);
        }
      }
    };
    visit(packageRoot);
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
function runtimeDigest(releasePath, manifest) {
  return digest(json(runtimeEntries(releasePath, manifest)));
}
export function directoryDigest(directory) {
  const name = path.basename(directory);
  const entries = runtimeEntries(path.dirname(directory), { packages: [{ name, path: name }] });
  return digest(json(entries.map(entry => ({ ...entry, path: entry.path.slice(name.length + 1) }))));
}
function expectedVerificationIds(manifest) {
  return manifest.packages.flatMap(pkg => [
    `${pkg.name}:typecheck`,
    `${pkg.name}:test`,
    ...(pkg.name === 'pi-interactive-subagents' ? [`${pkg.name}:test:integration`, `${pkg.name}:test:smoke`] : []),
  ]);
}
const LEGACY_RUNTIME_VERIFICATION_IDS = ['runtime:host', 'runtime:loader', 'runtime:tools', 'runtime:process-only', 'runtime:rpc'];
function modernBase(manifest) { return manifest.packages.some(pkg => pkg.name === '@tintinweb/pi-subagents'); }
function supplementalMode(manifest) { return modernBase(manifest) ? 'official-cli-faux-model-integration' : 'mock-host-api-direct-tool-execution'; }
function expectedRuntimeVerificationIds() {
  return ['runtime:host', 'runtime:loader', 'runtime:supplemental-tool-execution', 'runtime:process-only', 'runtime:rpc'];
}
function npmVersion() {
  const result = spawnSync(process.execPath, [npmExecPath(), '--version'], { encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(`Unable to identify npm: ${result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status ?? 'unknown'}`}`);
  return result.stdout.trim();
}
function pathWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function assertReleaseMutable(candidate) {
  const sealPath = path.join(candidate.path, ACTIVATION_SEAL);
  noSymlinkSegments(sealPath);
  if (fs.existsSync(sealPath)) throw new Error(`Release is sealed and cannot be modified: ${candidate.id}`);

  const statePath = path.join(candidate.path, '..', '..', 'state.json');
  noSymlinkSegments(statePath);
  if (fs.existsSync(statePath) && readJSON(statePath).release === candidate.id) {
    throw new Error(`Release is active and cannot be modified: ${candidate.id}`);
  }
  const home = path.resolve(candidate.path, '..', '..', '..');
  const settingsPath = path.join(home, '.pi', 'agent', 'settings.json');
  noSymlinkSegments(settingsPath);
  if (!fs.existsSync(settingsPath)) return;
  const settings = readJSON(settingsPath);
  if (settings.packages !== undefined && !Array.isArray(settings.packages)) throw new Error('packages must be an array');
  for (const entry of settings.packages ?? []) {
    const source = typeof entry === 'string' ? entry : entry?.source;
    if (typeof source !== 'string') throw new Error('Invalid package entry');
    const resolved = path.resolve(path.dirname(settingsPath), source.replaceAll('\\', '/'));
    if (pathWithin(candidate.path, resolved)) throw new Error(`Release is referenced by active settings and cannot be modified: ${candidate.id}`);
  }
}

export function validateRelease({ home, id, requireDependencies = false, requireVerified = false }) {
  if (typeof id !== 'string' || !/^h-[0-9a-f]{12}-s-[0-9a-f]{12}-m-[0-9a-f]{12}$/.test(id)) throw new Error(`Invalid release id: ${id}`);
  const releasePath = path.join(path.resolve(home), '.agent-config', 'releases', id);
  noSymlinkSegments(releasePath);
  const manifestPath = path.join(releasePath, 'release.json');
  noSymlinkSegments(manifestPath);
  const manifest = readJSON(manifestPath);
  if (![1, REPORT_SCHEMA].includes(manifest.schemaVersion) || manifest.id !== id || typeof manifest.piVersion !== 'string'
      || !object(manifest.sources) || !Array.isArray(manifest.packages)) {
    throw new Error(`Invalid release manifest: ${id}`);
  }
  const commits = {};
  for (const key of Object.keys(SOURCES)) {
    const commit = manifest.sources[key]?.commit;
    if (typeof commit !== 'string' || !SHA.test(commit)) throw new Error(`Invalid release source commit: ${key}`);
    commits[key] = commit;
  }
  if (Object.keys(manifest.sources).length !== Object.keys(SOURCES).length || releaseId(commits) !== id) {
    throw new Error('Release id does not match source commits');
  }
  const packageSpecs = PACKAGE_SOURCES.map(spec => spec.key === 'subagents' && modernBase(manifest)
    ? { ...spec, expectedName: '@tintinweb/pi-subagents' } : spec)
    .filter(spec => !spec.optional || manifest.packages.some(pkg => pkg?.name === spec.expectedName));
  if (manifest.packages.length !== packageSpecs.length) throw new Error(`Invalid release package inventory: ${id}`);
  for (const spec of packageSpecs) {
    const pkg = manifest.packages.find(item => item?.name === spec.expectedName);
    if (!pkg || pkg.path !== `packages/${spec.expectedName}` || pkg.source !== spec.key || pkg.commit !== commits[spec.key]
        || typeof pkg.version !== 'string' || !Array.isArray(pkg.extensions)) throw new Error(`Invalid release package: ${spec.expectedName}`);
    const extensions = new Set();
    for (const extension of pkg.extensions) {
      safeRelative(extension);
      if (extensions.has(extension) || !manifest.files.some(entry => entry.path === `${pkg.path}/${extension}`)) {
        throw new Error(`Invalid release extension: ${pkg.name}:${extension}`);
      }
      extensions.add(extension);
    }
  }
  if (new Set(manifest.packages.map(pkg => pkg.name)).size !== packageSpecs.length) throw new Error('Duplicate release package');
  validateSourceFiles(releasePath, manifest);

  const dependenciesPath = path.join(releasePath, DEPENDENCIES_REPORT);
  noSymlinkSegments(dependenciesPath);
  let currentRuntimeDigest;
  const measuredRuntimeDigest = () => currentRuntimeDigest ??= runtimeDigest(releasePath, manifest);
  let dependencies;
  if (requireDependencies || requireVerified) {
    dependencies = readJSON(dependenciesPath);
    const commonValid = dependencies.sourceDigest === manifest.sourceDigest && dependencies.status === 'passed' && Array.isArray(dependencies.packages)
      && dependencies.packages.length === manifest.packages.length
      && new Set(dependencies.packages.map(item => item?.name)).size === manifest.packages.length;
    if (dependencies.schemaVersion !== manifest.schemaVersion || !commonValid) throw new Error(`Release dependencies are not prepared: ${id}`);
    for (const pkg of manifest.packages) {
      const recorded = dependencies.packages.find(item => item.name === pkg.name);
      const lock = validateManifestPath(releasePath, `${pkg.path}/package-lock.json`);
      if (!recorded || recorded.lockSha256 !== digest(fs.readFileSync(lock))) throw new Error(`Dependency report mismatch: ${pkg.name}`);
      if (!fs.existsSync(path.join(releasePath, pkg.path, 'node_modules'))) throw new Error(`Dependencies missing: ${pkg.name}`);
    }
    if (dependencies.schemaVersion === REPORT_SCHEMA) {
      if (dependencies.developmentDigest !== developmentDigest(manifest)
          || JSON.stringify(dependencies.development?.npmArgs) !== JSON.stringify(DEVELOPMENT_NPM_ARGS)
          || dependencies.development?.npm !== dependencies.runtime?.npm
          || JSON.stringify(dependencies.runtime?.npmArgs) !== JSON.stringify(RUNTIME_NPM_ARGS)
          || dependencies.runtime?.node !== process.version || dependencies.runtime?.platform !== process.platform
          || dependencies.runtime?.arch !== process.arch || typeof dependencies.runtime?.npm !== 'string' || !dependencies.runtime.npm) {
        throw new Error(`Reduced runtime dependency report is not valid: ${id}`);
      }
      if (dependencies.runtimeDigest !== measuredRuntimeDigest()) throw new Error(`Runtime changed after dependency stage: ${id}`);
      if (!requireVerified) validateDevelopmentTree(releasePath, manifest);
    }
  }
  if (requireVerified) {
    const verificationPath = path.join(releasePath, VERIFICATION_REPORT);
    const sealPath = path.join(releasePath, ACTIVATION_SEAL);
    noSymlinkSegments(verificationPath);
    noSymlinkSegments(sealPath);
    const sealed = fs.existsSync(sealPath);
    const verification = readJSON(verificationPath);
    const commonValid = verification.status === 'passed' && verification.sourceDigest === manifest.sourceDigest
      && verification.dependenciesDigest === reportDigest(dependenciesPath)
      && verification.runtime?.node === process.version && verification.runtime?.platform === process.platform
      && verification.runtime?.arch === process.arch;
    if (dependencies.schemaVersion === 1) {
      if (verification.schemaVersion !== 1 || !commonValid || !Array.isArray(verification.checks)
          || verification.checks.some(item => item.ok !== true)
          || JSON.stringify(verification.checks.map(item => item.id)) !== JSON.stringify(expectedVerificationIds(manifest))) {
        throw new Error(`Release verification is not valid: ${id}`);
      }
    } else {
      const host = verification.host;
      const loader = verification.loader;
      const runner = verification.runner;
      const runnerFiles = runner?.files;
      const runtimeCheckIds = verification.runtimeChecks?.map(item => item.id);
      const currentRuntimeIds = JSON.stringify(expectedRuntimeVerificationIds());
      const legacySealedRuntimeIds = sealed && JSON.stringify(runtimeCheckIds) === JSON.stringify(LEGACY_RUNTIME_VERIFICATION_IDS);
      const currentRunnerFiles = {
        'scripts/releases.mjs': digest(fs.readFileSync(fileURLToPath(import.meta.url))),
        'scripts/runtime-smoke.mjs': digest(fs.readFileSync(fileURLToPath(new URL('./runtime-smoke.mjs', import.meta.url)))),
        'scripts/verify-env.mjs': digest(fs.readFileSync(fileURLToPath(new URL('./verify-env.mjs', import.meta.url)))),
      };
      if (verification.schemaVersion !== REPORT_SCHEMA || !commonValid
          || verification.developmentDigest !== dependencies.developmentDigest
          || verification.runtimeDigest !== dependencies.runtimeDigest
          || verification.runtime?.npm !== dependencies.runtime.npm
          || !Array.isArray(verification.fullChecks) || verification.fullChecks.some(item => item.ok !== true)
          || JSON.stringify(verification.fullChecks.map(item => item.id)) !== JSON.stringify(expectedVerificationIds(manifest))
          || !Array.isArray(verification.runtimeChecks) || verification.runtimeChecks.some(item => item.ok !== true)
          || (JSON.stringify(runtimeCheckIds) !== currentRuntimeIds && !legacySealedRuntimeIds)
          || host?.package !== '@earendil-works/pi-coding-agent' || host?.version !== manifest.piVersion
          || !validContentHash(host?.packageSha256) || !validContentHash(host?.executableSha256) || !validContentHash(host?.cliSha256)
          || loader?.package !== '@earendil-works/pi-coding-agent' || loader?.version !== manifest.piVersion
          || !validContentHash(loader?.packageSha256) || !validContentHash(loader?.loaderSha256)
          || (!legacySealedRuntimeIds && loader?.mode !== 'official-cli-rpc')
          || (!legacySealedRuntimeIds && verification.supplemental?.mode !== supplementalMode(manifest))
          || !object(runnerFiles)
          || !validContentHash(runnerFiles?.['scripts/releases.mjs'])
          || !validContentHash(runnerFiles?.['scripts/runtime-smoke.mjs'])
          || !validContentHash(runnerFiles?.['scripts/verify-env.mjs'])
          || Object.keys(runnerFiles ?? {}).length !== 3
          || (!sealed && JSON.stringify(runnerFiles) !== JSON.stringify(currentRunnerFiles))
          || fs.existsSync(path.join(releasePath, DEVELOPMENT_ROOT))) {
        throw new Error(`Reduced runtime verification is not valid: ${id}`);
      }
    }
    if (verification.runtimeDigest !== measuredRuntimeDigest()) throw new Error(`Verified release changed after checks: ${id}`);
    if (sealed) {
      const seal = readJSON(sealPath);
      if (seal.schemaVersion !== manifest.schemaVersion || seal.release !== id || seal.sourceDigest !== manifest.sourceDigest
          || seal.runtimeDigest !== verification.runtimeDigest || seal.verificationDigest !== reportDigest(verificationPath)) {
        throw new Error(`Invalid activation seal: ${id}`);
      }
    }
  }
  return { id, path: releasePath, manifest, dependencies };
}

export function sealRelease({ home, id, expectedPath }) {
  const candidate = validateRelease({ home, id, requireVerified: true });
  if (expectedPath !== undefined && path.resolve(candidate.path) !== path.resolve(expectedPath)) {
    throw new Error('Selected release path changed since preview');
  }
  const verificationPath = path.join(candidate.path, VERIFICATION_REPORT);
  const verification = readJSON(verificationPath);
  const sealPath = path.join(candidate.path, ACTIVATION_SEAL);
  noSymlinkSegments(sealPath);
  const seal = {
    schemaVersion: candidate.manifest.schemaVersion,
    release: id,
    sourceDigest: candidate.manifest.sourceDigest,
    runtimeDigest: verification.runtimeDigest,
    verificationDigest: reportDigest(verificationPath),
  };
  if (fs.existsSync(sealPath)) {
    if (JSON.stringify(readJSON(sealPath)) !== JSON.stringify(seal)) throw new Error(`Invalid activation seal: ${id}`);
    return sealPath;
  }
  fs.mkdirSync(path.dirname(sealPath), { recursive: true });
  fs.writeFileSync(sealPath, json(seal), { flag: 'wx', mode: 0o600 });
  return sealPath;
}

export function installReleaseDependencies({ home, id, apply = false, runNpm, getNpmVersion = npmVersion }) {
  const candidate = validateRelease({ home, id });
  const developmentPath = path.join(candidate.path, DEVELOPMENT_ROOT);
  const commands = [
    ...candidate.manifest.packages.map(pkg => ({
      phase: 'development', name: pkg.name, cwd: path.join(developmentPath, developmentPackagePath(candidate.manifest, pkg)), args: [...DEVELOPMENT_NPM_ARGS],
    })),
    ...candidate.manifest.packages.map(pkg => ({
      phase: 'runtime', name: pkg.name, cwd: path.join(candidate.path, pkg.path), args: [...RUNTIME_NPM_ARGS],
    })),
  ];
  if (candidate.manifest.files.some(file => file.path === 'native/package.json')) {
    commands.push({ phase: 'runtime', name: 'native-npm', cwd: path.join(candidate.path, 'native'),
      args: [...RUNTIME_NPM_ARGS, '--legacy-peer-deps'] });
  }
  if (!apply) return { ...candidate, developmentPath, commands, written: false };
  assertReleaseMutable(candidate);
  if (candidate.manifest.schemaVersion !== REPORT_SCHEMA) throw new Error('Legacy v1 releases are immutable; prepare a schema v2 candidate instead');
  const verificationPath = path.join(candidate.path, VERIFICATION_REPORT);
  const dependenciesPath = path.join(candidate.path, DEPENDENCIES_REPORT);
  const failurePath = path.join(candidate.path, DEPENDENCY_FAILURE_REPORT);
  for (const target of [verificationPath, dependenciesPath, failurePath]) noSymlinkSegments(target);
  fs.rmSync(verificationPath, { force: true });
  fs.rmSync(dependenciesPath, { force: true });
  prepareDevelopmentTree(candidate.path, candidate.manifest);
  const invoke = runNpm ?? ((cwd, npmArgs) => {
    return spawnSync(process.execPath, [npmExecPath(), ...npmArgs], { cwd, stdio: 'inherit', shell: false });
  });
  let activeCommand;
  try {
    for (const command of commands) {
      activeCommand = command;
      const result = invoke(command.cwd, command.args, command.name, command.phase);
      if (!result || result.status !== 0) throw new Error(`Dependency installation failed for ${command.name} (${command.phase}): ${result?.error?.message ?? `exit ${result?.status ?? 'unknown'}`}`);
    }
    validateDevelopmentTree(candidate.path, candidate.manifest);
    validateSourceFiles(candidate.path, candidate.manifest);
    const packages = candidate.manifest.packages.map(pkg => {
      const runtimeModules = path.join(candidate.path, pkg.path, 'node_modules');
      const developmentModules = path.join(developmentPath, developmentPackagePath(candidate.manifest, pkg), 'node_modules');
      if (!fs.existsSync(runtimeModules)) {
        const metadata = readJSON(path.join(candidate.path, pkg.path, 'package.json'));
        const lock = readJSON(path.join(candidate.path, pkg.path, 'package-lock.json'));
        const noProductionDependencies = Object.keys(metadata.dependencies ?? {}).length === 0
          && Object.keys(metadata.optionalDependencies ?? {}).length === 0;
        const devOnly = object(lock.packages) && Object.entries(lock.packages).every(([name, entry]) => !name || entry.dev === true);
        if (!noProductionDependencies || !devOnly) throw new Error(`Dependency installation produced no runtime node_modules for ${pkg.name}`);
        // npm may omit this directory entirely when every locked dependency is development-only.
        fs.mkdirSync(runtimeModules);
      }
      if (!fs.existsSync(developmentModules)) throw new Error(`Dependency installation produced no development node_modules for ${pkg.name}`);
      return { name: pkg.name, lockSha256: digest(fs.readFileSync(path.join(candidate.path, pkg.path, 'package-lock.json'))) };
    });
    const installedNpmVersion = getNpmVersion();
    const report = {
      schemaVersion: REPORT_SCHEMA,
      status: 'passed',
      sourceDigest: candidate.manifest.sourceDigest,
      developmentDigest: developmentDigest(candidate.manifest),
      runtimeDigest: runtimeDigest(candidate.path, candidate.manifest),
      development: { npmArgs: [...DEVELOPMENT_NPM_ARGS], npm: installedNpmVersion },
      runtime: {
        npmArgs: [...RUNTIME_NPM_ARGS], npm: installedNpmVersion,
        node: process.version, platform: process.platform, arch: process.arch,
      },
      packages,
    };
    fs.mkdirSync(path.dirname(dependenciesPath), { recursive: true });
    fs.writeFileSync(dependenciesPath, json(report), { mode: 0o600 });
    fs.rmSync(failurePath, { force: true });
    return { ...candidate, developmentPath, commands, written: true, report };
  } catch (error) {
    fs.mkdirSync(path.dirname(failurePath), { recursive: true });
    fs.writeFileSync(failurePath, json({
      schemaVersion: REPORT_SCHEMA, status: 'failed', sourceDigest: candidate.manifest.sourceDigest,
      phase: activeCommand?.phase ?? 'prepare-development', package: activeCommand?.name,
      reason: error instanceof Error ? error.message : String(error),
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
    }), { mode: 0o600 });
    throw error;
  }
}

export function verifyRelease({ home, id, apply = false, runChecks, runRuntimeChecks }) {
  const verificationStarted = performance.now();
  const mutableCandidate = validateRelease({ home, id });
  assertReleaseMutable(mutableCandidate);
  const candidate = validateRelease({ home, id, requireDependencies: true });
  if (candidate.dependencies.schemaVersion !== REPORT_SCHEMA) throw new Error('Legacy dependency reports cannot be used to create reduced-runtime verification reports');
  const developmentPath = path.join(candidate.path, DEVELOPMENT_ROOT);
  const reportPath = path.join(candidate.path, VERIFICATION_REPORT);
  noSymlinkSegments(reportPath);
  if (apply) fs.rmSync(reportPath, { force: true });
  const checks = candidate.manifest.packages.flatMap(pkg => {
    const cwd = path.join(developmentPath, developmentPackagePath(candidate.manifest, pkg));
    const scripts = readJSON(path.join(cwd, 'package.json')).scripts ?? {};
    const planned = [
      { id: `${pkg.name}:typecheck`, name: pkg.name, cwd, args: ['run', 'typecheck'] },
      { id: `${pkg.name}:test`, name: pkg.name, cwd, args: ['test', ...(modernBase(candidate.manifest) && ['@tintinweb/pi-subagents', '@tintinweb/pi-tasks', 'pi-supervisor', 'observational-memory'].includes(pkg.name) ? ['--', '--maxWorkers=2'] : [])] },
    ];
    if (pkg.name === 'pi-interactive-subagents') {
      for (const script of ['test:integration', 'test:smoke']) {
        if (typeof scripts[script] !== 'string') throw new Error(`Required candidate script missing: ${pkg.name}:${script}`);
        planned.push({ id: `${pkg.name}:${script}`, name: pkg.name, cwd, args: ['run', script] });
      }
    }
    return planned;
  });
  const verificationHome = fs.mkdtempSync(path.join(candidate.path, RELEASE_META, 'verification-home-'));
  const verificationTemp = path.join(verificationHome, 'tmp');
  fs.mkdirSync(verificationTemp, { recursive: true });
  const childEnv = verificationEnvironment(process.env, { home: verificationHome, temp: verificationTemp });
  const invoke = runChecks ?? ((check, options) => {
    const result = spawnSync(process.execPath, [npmExecPath(), ...check.args], {
      cwd: check.cwd, stdio: 'inherit', shell: false, env: options.env,
    });
    return { ok: result.status === 0, reason: result.error?.message ?? (result.status === 0 ? undefined : `exit ${result.status ?? 'unknown'}`) };
  });
  const fullChecks = [];
  for (const check of checks) {
    const started = performance.now();
    const gitFixture = !runChecks && check.id === '@tintinweb/pi-subagents:test' ? path.join(check.cwd, '.git') : undefined;
    let checkResult, ownsGitFixture = false;
    try {
      if (gitFixture) {
        if (fs.existsSync(gitFixture)) throw new Error('Unexpected Git metadata in development snapshot');
        ownsGitFixture = true;
        run('git', ['init', '--quiet', check.cwd], { env: childEnv });
      }
      checkResult = invoke(check, { env: childEnv });
    } finally {
      if (ownsGitFixture) fs.rmSync(gitFixture, { recursive: true, force: true });
    }
    fullChecks.push({
      id: check.id, ok: checkResult?.ok === true, durationMs: Math.round(performance.now() - started),
      ...(checkResult?.reason ? { reason: checkResult.reason } : {}),
    });
  }
  let sourceValidationStarted = performance.now();
  validateDevelopmentTree(candidate.path, candidate.manifest);
  validateSourceFiles(candidate.path, candidate.manifest);
  let sourceValidationMs = performance.now() - sourceValidationStarted;
  let runtimeDigestStarted = performance.now();
  const runtimeBeforeSmoke = runtimeDigest(candidate.path, candidate.manifest);
  let runtimeDigestMs = performance.now() - runtimeDigestStarted;
  if (runtimeBeforeSmoke !== candidate.dependencies.runtimeDigest) throw new Error(`Runtime changed after dependency stage: ${id}`);
  let smoke;
  try {
    smoke = runRuntimeChecks
      ? runRuntimeChecks({ candidate, developmentPath, env: childEnv })
      : (() => {
          const script = fileURLToPath(new URL('./runtime-smoke.mjs', import.meta.url));
          const execution = spawnSync(process.execPath, [script, candidate.path, developmentPath], {
            encoding: 'utf8', shell: false, env: childEnv, timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
          });
          if (execution.status !== 0) throw new Error(`Runtime smoke failed: ${execution.error?.message ?? execution.stderr?.trim() ?? `exit ${execution.status ?? 'unknown'}`}`);
          return JSON.parse(execution.stdout);
        })();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    smoke = { results: expectedRuntimeVerificationIds().map(checkId => ({ id: checkId, ok: false, durationMs: 0, reason })) };
  }
  let runtimeChecks = Array.isArray(smoke?.results) ? smoke.results : [];
  const invalidateRuntimeCheck = (checkId, reason) => {
    runtimeChecks = runtimeChecks.map(item => item.id === checkId ? { ...item, ok: false, reason } : item);
  };
  const host = smoke?.host;
  if (host?.package !== '@earendil-works/pi-coding-agent' || host?.version !== candidate.manifest.piVersion
      || !validContentHash(host?.packageSha256) || !validContentHash(host?.executableSha256) || !validContentHash(host?.cliSha256)) {
    invalidateRuntimeCheck('runtime:host', `Expected identified Pi ${candidate.manifest.piVersion}, got ${host?.version ?? 'unknown'}`);
  }
  const loader = smoke?.loader;
  if (loader?.package !== '@earendil-works/pi-coding-agent' || loader?.version !== candidate.manifest.piVersion
      || !validContentHash(loader?.packageSha256) || !validContentHash(loader?.loaderSha256)
      || loader?.mode !== 'official-cli-rpc' || !validContentHash(smoke?.runner?.sha256)) {
    invalidateRuntimeCheck('runtime:loader', 'Official RPC loader or smoke runner identity is invalid');
  }
  if (smoke?.supplemental?.mode !== supplementalMode(candidate.manifest)) {
    invalidateRuntimeCheck('runtime:supplemental-tool-execution', 'Supplemental mocked-host execution evidence is invalid');
  }
  fs.rmSync(verificationHome, { recursive: true, force: true });
  sourceValidationStarted = performance.now();
  validateDevelopmentTree(candidate.path, candidate.manifest);
  validateSourceFiles(candidate.path, candidate.manifest);
  sourceValidationMs = Math.round(sourceValidationMs + performance.now() - sourceValidationStarted);
  runtimeDigestStarted = performance.now();
  const verifiedRuntimeDigest = runtimeDigest(candidate.path, candidate.manifest);
  runtimeDigestMs = Math.round(runtimeDigestMs + performance.now() - runtimeDigestStarted);
  if (verifiedRuntimeDigest !== candidate.dependencies.runtimeDigest) throw new Error(`Runtime changed after dependency stage: ${id}`);
  const timings = { sourceValidationMs, runtimeDigestMs, totalMs: Math.round(performance.now() - verificationStarted) };
  const passed = fullChecks.every(item => item.ok) && runtimeChecks.every(item => item.ok)
    && JSON.stringify(runtimeChecks.map(item => item.id)) === JSON.stringify(expectedRuntimeVerificationIds());
  const runnerFiles = {
    'scripts/releases.mjs': digest(fs.readFileSync(fileURLToPath(import.meta.url))),
    'scripts/runtime-smoke.mjs': smoke?.runner?.sha256,
    'scripts/verify-env.mjs': digest(fs.readFileSync(fileURLToPath(new URL('./verify-env.mjs', import.meta.url)))),
  };
  const report = {
    schemaVersion: REPORT_SCHEMA, status: passed ? 'passed' : 'failed', sourceDigest: candidate.manifest.sourceDigest,
    developmentDigest: candidate.dependencies.developmentDigest,
    dependenciesDigest: reportDigest(path.join(candidate.path, DEPENDENCIES_REPORT)),
    runtimeDigest: verifiedRuntimeDigest,
    fullChecks, runtimeChecks, host: smoke?.host, loader: smoke?.loader, supplemental: smoke?.supplemental,
    runner: { files: runnerFiles }, timings,
    runtime: { node: process.version, npm: candidate.dependencies.runtime.npm, platform: process.platform, arch: process.arch },
  };
  if (apply) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    if (passed) {
      const pending = path.join(candidate.path, RELEASE_META, `.verification-${randomUUID()}.json`);
      fs.writeFileSync(pending, json(report), { mode: 0o600 });
      try {
        fs.renameSync(pending, reportPath);
        fs.rmSync(developmentPath, { recursive: true, force: true });
      } catch (error) {
        fs.rmSync(pending, { force: true });
        throw error;
      }
    } else {
      fs.writeFileSync(reportPath, json(report), { mode: 0o600 });
    }
  }
  return { ...candidate, developmentPath, checks, fullChecks, runtimeChecks, timings, passed, written: apply, report };
}

function parsePrepareArgs(argv) {
  let home = os.homedir(), apply = false, sourceMap;
  const repositories = {}, commits = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === '--apply') apply = true;
    else if (['--home', '--source-map', '--harness-repo', '--subagents-repo', '--memory-repo', '--harness-commit', '--subagents-commit', '--memory-commit'].includes(arg) && value && !value.startsWith('--')) {
      index++;
      if (arg === '--home') home = path.resolve(value);
      else if (arg === '--source-map') sourceMap = path.resolve(value);
      else if (arg.endsWith('-repo')) repositories[arg.slice(2, -5)] = path.resolve(value);
      else commits[arg.slice(2, -7)] = value;
    } else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  if (sourceMap) {
    const mapped = readJSON(sourceMap);
    for (const key of Object.keys(SOURCES)) if (!repositories[key] && typeof mapped[key] === 'string') repositories[key] = path.resolve(mapped[key]);
  }
  return { home: path.resolve(home), apply, repositories, commits };
}

export const releaseUsage = `Usage:
  npm run release -- --home <temporary-home> --harness-repo <absolute-path> --harness-commit <full-sha> --subagents-repo <absolute-path> --subagents-commit <full-sha> --memory-repo <absolute-path> --memory-commit <full-sha> [--source-map <local-json>] [--apply]

Preview is the default. --apply creates only .agent-config/releases/<id>; it does not change active settings.
Candidate flow:
  npm run deps -- --home <home> --release <id> [--apply]
  npm run verify -- --home <home> --release <id> [--apply]
  npm run plan -- --home <home> --release <id>
  npm run apply -- --home <home> --release <id>
The dependency preview runs no npm command. Verification runs offline checks; --apply records their result. Activation rejects candidates without both successful phases.
Rollback means selecting an earlier verified release with --release via plan/apply. It restores only compatible managed resources, managed setting keys, and package paths; unrelated configuration is not rolled back. Multi-file activation is guarded and backed up, but is not transactional.
Use --migrate-base on plan/apply to retire the old subagent profiles, package and Pi RTK hook with backups.`;

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help')) { console.log(releaseUsage); return 0; }
  const options = parsePrepareArgs(argv);
  const plan = planRelease(options);
  console.log(`${options.apply ? 'PREPARE' : 'PLAN'} release ${plan.id} (${plan.files.length} committed/generated files)`);
  if (options.apply) {
    executeRelease(plan);
    console.log(`Prepared ${plan.releasePath}. Active settings were not changed.`);
  } else {
    console.log('No files written. Use --apply to prepare the candidate.');
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
