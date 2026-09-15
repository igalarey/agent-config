import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { sealRelease, validateRelease, directoryDigest } from './releases.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = text => createHash('sha256').update(text).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function readJSON(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!object(value)) throw new Error(`Expected JSON object: ${file}`);
  return value;
}
export function merge(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe configuration key');
    result[key] = object(value) ? merge(object(base[key]) ? base[key] : {}, value) : value;
  }
  return result;
}
export function args(argv) {
  let home = os.homedir(), apply = false, withRtk = false, migratePackages = false, retireOrcaSkills = false, migrateBase = false, release;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') apply = true;
    else if (argv[i] === '--with-rtk') throw new Error('RTK is retired from this base');
    else if (argv[i] === '--migrate-base') migrateBase = true;
    else if (argv[i] === '--migrate-packages') migratePackages = true;
    else if (argv[i] === '--retire-orca-skills') retireOrcaSkills = true;
    else if (argv[i] === '--home' && argv[i + 1] && !argv[i + 1].startsWith('--')) home = path.resolve(argv[++i]);
    else if (argv[i] === '--release' && argv[i + 1] && !argv[i + 1].startsWith('--')) release = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
  }
  return { home: path.resolve(home), apply, withRtk, migratePackages, retireOrcaSkills, migrateBase, release };
}
function files(dir) {
  const ignoredDirectories = new Set(['.venv', '__pycache__', 'node_modules']);
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const p = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Source symlink not allowed: ${p}`);
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    if (entry.isFile() && entry.name.endsWith('.pyc')) return [];
    return entry.isDirectory() ? files(p) : [p];
  }).sort();
}
export function noSymlinks(file) {
  for (let p = file; p !== path.dirname(p); p = path.dirname(p)) {
    let stat;
    try { stat = fs.lstatSync(p); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isSymbolicLink()) throw new Error(`Refusing symlink destination: ${p}`);
  }
}
const RESOURCE_PROJECTIONS = [
  { section: 'guides', destination: '.agents/guides' },
  { section: 'skills', destination: '.agents/skills' },
  { section: 'agents', destination: '.pi/agent/agents' },
  { section: 'prompts', destination: '.pi/agent/prompts', optional: true },
];
function projectedResources(source) {
  return RESOURCE_PROJECTIONS.flatMap(({ section, destination, optional }) => {
    const sourceRoot = path.join(source, section);
    if (optional && !fs.existsSync(sourceRoot)) return [];
    return files(sourceRoot).map(file => ({
      file,
      relative: path.join(destination, path.relative(sourceRoot, file)).replaceAll('\\', '/'),
    }));
  });
}
function settingsReleaseIds(home) {
  const settingsPath = path.join(home, '.pi', 'agent', 'settings.json');
  noSymlinks(settingsPath);
  if (!fs.existsSync(settingsPath)) return [];
  const settings = readJSON(settingsPath);
  if (settings.packages !== undefined && !Array.isArray(settings.packages)) throw new Error('packages must be an array');
  const releasesRoot = path.join(path.resolve(home), '.agent-config', 'releases');
  const ids = new Set();
  for (const entry of settings.packages ?? []) {
    const source = typeof entry === 'string' ? entry : entry?.source;
    if (typeof source !== 'string') throw new Error('Invalid package entry');
    const resolved = path.resolve(path.dirname(settingsPath), source.replaceAll('\\', '/'));
    const relative = path.relative(releasesRoot, resolved);
    const parts = relative.split(path.sep);
    if (parts.length >= 3 && parts[1].toLowerCase() === 'packages' && /^h-[0-9a-f]{12}-s-[0-9a-f]{12}-m-[0-9a-f]{12}$/i.test(parts[0])) ids.add(parts[0].toLowerCase());
  }
  return [...ids];
}
function managedShape(source) {
  const resources = projectedResources(source).map(resource => resource.relative);
  resources.push('.agents/SYSTEM.md');
  const keys = [];
  const walk = (value, prefix = '') => {
    for (const [key, child] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
      const current = prefix ? `${prefix}.${key}` : key;
      keys.push(current);
      if (object(child)) walk(child, current);
    }
  };
  walk(readJSON(path.join(source, 'config/pi.settings.json')));
  return { resources: resources.sort(), settingsKeys: keys.sort() };
}
export function plan({ home, source = root, withRtk = false, migratePackages = false, retireOrcaSkills = false, migrateBase = false, release }) {
  const statePath = path.join(home, '.agent-config', 'state.json');
  noSymlinks(statePath);
  const previous = fs.existsSync(statePath) ? readJSON(statePath) : { files: {} };
  if (!object(previous.files) || (previous.release !== undefined && typeof previous.release !== 'string')) throw new Error('Invalid installer state');
  if (!release) {
    const configuredReleases = settingsReleaseIds(home);
    if (typeof previous.release === 'string') {
      if (configuredReleases.some(id => id !== previous.release)) {
        throw new Error('Configured release does not match installer state; pass --release <id> explicitly');
      }
      release = previous.release;
    } else if (configuredReleases.length) {
      throw new Error(`Settings reference release ${configuredReleases.join(', ')} but installer state has no active release; pass --release <id> explicitly`);
    }
  }
  if (release) source = validateRelease({ home, id: release, requireVerified: true }).path;
  const modern = fs.existsSync(path.join(source, 'config/subagents.json'));
  if (withRtk) throw new Error('RTK is retired from this base');
  const operations = [], conflicts = [], tracked = { ...previous.files }, retiredResources = [];
  let priorRelease;
  if (release && typeof previous.release === 'string' && previous.release !== release) {
    priorRelease = validateRelease({ home, id: previous.release });
    const prior = priorRelease.path;
    const beforeShape = managedShape(prior), nextShape = managedShape(source);
    if (JSON.stringify(beforeShape) !== JSON.stringify(nextShape)) {
      const beforeResources = new Set(beforeShape.resources), nextResources = new Set(nextShape.resources);
      const removed = beforeShape.resources.filter(relative => !nextResources.has(relative));
      const added = nextShape.resources.filter(relative => !beforeResources.has(relative));
      const orcaSkills = new Set([
        '.agents/skills/computer-use/SKILL.md',
        '.agents/skills/orca-cli/SKILL.md',
        '.agents/skills/orchestration/SKILL.md',
      ]);
      const permittedOrcaShapeChange = retireOrcaSkills
        && JSON.stringify(beforeShape.settingsKeys) === JSON.stringify(nextShape.settingsKeys)
        && [...removed, ...added].every(relative => orcaSkills.has(relative));
      const settingsShapeUnchanged = JSON.stringify(beforeShape.settingsKeys) === JSON.stringify(nextShape.settingsKeys);
      const permittedWorkflowGuideChange = settingsShapeUnchanged
        && [...removed, ...added].every(relative => relative === '.agents/guides/task-workflow.md');
      const permittedPromptChange = settingsShapeUnchanged
        && [...removed, ...added].every(relative => relative.startsWith('.pi/agent/prompts/'));
      if (permittedOrcaShapeChange || permittedWorkflowGuideChange || permittedPromptChange || (modern && migrateBase
          && [...removed, ...added].every(relative => relative.startsWith('.pi/agent/agents/')))) retiredResources.push(...removed);
      else conflicts.push('incompatible release rollback/update: managed resource or settings key set changed');
    }
  }
  function add(relative, content, managed = true) {
    const target = path.join(home, relative);
    noSymlinks(target);
    const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (modern && before !== null && relative.replaceAll('\\', '/').startsWith('.agents/')) return;
    if (before !== content && managed && before !== null && previous.files[relative] !== digest(before)) {
      conflicts.push(relative);
      return;
    }
    if (managed) tracked[relative] = digest(content);
    if (before !== content) operations.push({ relative, target, before, content });
  }
  function retire(relative) {
    const target = path.join(home, relative);
    noSymlinks(target);
    const trackedRelative = Object.hasOwn(previous.files, relative) ? relative : path.normalize(relative);
    const expected = previous.files[trackedRelative];
    if (typeof expected !== 'string') {
      conflicts.push(`retired resource is not tracked: ${relative}`);
      return;
    }
    const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (before !== null && digest(before) !== expected) {
      conflicts.push(relative);
      return;
    }
    delete tracked[trackedRelative];
    if (before !== null) operations.push({ relative, target, before, content: null });
  }
  for (const resource of projectedResources(source)) {
    add(resource.relative, fs.readFileSync(resource.file, 'utf8'));
  }
  for (const relative of retiredResources) retire(relative);
  if (modern) {
    for (const name of ['subagents.json', 'tasks-config.json', 'SUPERVISOR.md']) {
      add(`.pi/agent/${name}`, fs.readFileSync(path.join(source, 'config', name), 'utf8'));
    }
    const legacyResources = ['.pi/agent/extensions/rtk.ts', '.pi/agent/agents/scout.md',
      '.pi/agent/agents/researcher.md', '.pi/agent/agents/worker.md'];
    if (migrateBase) {
      const agentFolder = path.join(home, '.pi/agent/agents');
      noSymlinks(agentFolder);
      const managedAgents = new Set(files(path.join(source, 'agents')).map(file => path.basename(file)));
      for (const name of fs.existsSync(agentFolder) ? fs.readdirSync(agentFolder) : []) {
        if (name.endsWith('.md') && !managedAgents.has(name)) legacyResources.push(`.pi/agent/agents/${name}`);
      }
    }
    for (const relative of new Set(legacyResources)) {
      if (!fs.existsSync(path.join(home, relative)) || operations.some(op => op.relative === relative)) continue;
      if (migrateBase) { add(relative, null, false); delete tracked[relative]; }
      else conflicts.push(`Legacy resource requires --migrate-base: ${relative}`);
    }
  }
  add('.agents/SYSTEM.md', fs.readFileSync(path.join(source, 'SYSTEM.md'), 'utf8'));
  const settingsPath = path.join(home, '.pi/agent/settings.json');
  noSymlinks(settingsPath);
  const settings = fs.existsSync(settingsPath) ? readJSON(settingsPath) : {};
  if (settings.packages !== undefined && !Array.isArray(settings.packages)) throw new Error('packages must be an array');
  const manifest = readJSON(path.join(source, 'manifests/packages.json'));
  const defaults = readJSON(path.join(source, 'config/pi.settings.json'));
  const priorDefaults = priorRelease
    ? readJSON(path.join(priorRelease.path, 'config/pi.settings.json'))
    : undefined;
  const packages = [...(settings.packages ?? [])], migrations = [];
  const packageSource = value => {
    const text = typeof value === 'string' ? value : value?.source;
    if (typeof text !== 'string') throw new Error('Invalid package entry');
    return text;
  };
  const packageNameMatches = (text, name) => {
    const aliases = [name, ...(name.startsWith('@') ? [name.slice(1)] : []),
      ...(name === 'observational-memory' ? ['pi-observational-memory'] : [])];
    return aliases.some(alias => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|[/\\\\@:])${escaped}(?:$|[/\\\\@#?])`).test(text);
    });
  };
  if (modern) {
    for (let index = packages.length - 1; index >= 0; index--) {
      const from = packageSource(packages[index]);
      const retired = ['pi-interactive-subagents', 'rtk-pi-hook', ...(defaults.packages?.length ? ['pi-mcp', 'pi-web-fetch'] : [])];
      if (!retired.some(name => packageNameMatches(from, name))) continue;
      if (!migrateBase) conflicts.push('Legacy package requires --migrate-base');
      else { packages.splice(index, 1); migrations.push({ name: 'retired-base-package', from, to: null }); }
    }
  }
  if (priorRelease) {
    const nextNames = new Set(manifest.packages.map(pkg => pkg.name));
    for (const pkg of priorRelease.manifest.packages.filter(pkg => !nextNames.has(pkg.name))) {
      const priorPath = path.resolve(priorRelease.path, pkg.path);
      for (let index = packages.length - 1; index >= 0; index--) {
        const from = packageSource(packages[index]);
        if (path.resolve(path.dirname(settingsPath), from.replaceAll('\\', '/')) !== priorPath) continue;
        packages.splice(index, 1);
        migrations.push({ name: pkg.name, from, to: null });
      }
    }
  }
  for (const pkg of manifest.packages) {
    const absolute = path.resolve(source, pkg.path);
    const sources = packages.map(packageSource);
    const exact = sources.map((text, index) =>
      path.resolve(path.dirname(settingsPath), text.replaceAll('\\', '/')) === absolute ? index : -1).filter(index => index !== -1);
    const named = sources.map((text, index) => packageNameMatches(text, pkg.name) ? index : -1).filter(index => index !== -1);
    const candidates = [...new Set([...exact, ...named])];
    if (candidates.length > 1) {
      conflicts.push(`package configured multiple times: ${pkg.name}`);
    } else if (exact.length === 1) {
      continue;
    } else if (candidates.length === 1) {
      const index = candidates[0], before = packages[index], sourceText = sources[index];
      if (!migratePackages && !release) {
        conflicts.push(`package already configured: ${pkg.name} (use --migrate-packages)`);
      } else {
        packages[index] = typeof before === 'string' ? absolute.replaceAll('\\', '/') : { ...before, source: absolute.replaceAll('\\', '/') };
        migrations.push({ name: pkg.name, from: sourceText, to: absolute });
      }
    } else {
      packages.push(absolute.replaceAll('\\', '/'));
    }
  }
  for (const entry of defaults.packages ?? []) {
    const spec = packageSource(entry), match = /^npm:((?:@[^/]+\/)?[^@]+)@(\d+\.\d+\.\d+)$/.exec(spec);
    if (!match) throw new Error('Default npm packages must use exact versions');
    const matches = packages.map((value, index) => packageNameMatches(packageSource(value), match[1]) ? index : -1).filter(index => index >= 0);
    if (matches.length > 1) conflicts.push(`package configured multiple times: ${match[1]}`);
    else if (matches.length === 1) {
      const index = matches[0], before = packages[index];
      const retained = object(before) ? { ...before } : {};
      const priorMatches = (priorDefaults?.packages ?? []).filter(value =>
        packageNameMatches(packageSource(value), match[1]));
      if (priorMatches.length > 1) {
        conflicts.push(`package configured multiple times in prior release: ${match[1]}`);
      } else if (priorMatches.length === 1 && object(priorMatches[0])) {
        for (const [key, value] of Object.entries(priorMatches[0])) {
          if (key === 'source' || Object.hasOwn(object(entry) ? entry : {}, key) || !Object.hasOwn(retained, key)) continue;
          if (!isDeepStrictEqual(retained[key], value)) {
            conflicts.push(`managed package setting changed: ${match[1]}.${key}`);
          } else delete retained[key];
        }
      }
      packages[index] = typeof entry === 'string' && typeof before === 'string' ? entry
        : { ...retained, ...(object(entry) ? entry : {}), source: spec };
    } else packages.push(entry);
  }
  let nativeDigest = previous.nativeDigest;
  if (release && defaults.packages?.length) {
    const nativeSource = path.join(source, 'native'), target = path.join(home, '.pi/agent/npm');
    noSymlinks(target);
    nativeDigest = directoryDigest(nativeSource);
    const beforeDigest = fs.existsSync(target) ? directoryDigest(target) : null;
    if (beforeDigest !== nativeDigest) {
      if (beforeDigest !== null && beforeDigest !== previous.nativeDigest) conflicts.push('npm prefix has unmanaged changes; preserved');
      else operations.push({ relative: '.pi/agent/npm', target, nativeSource, nativeDigest, beforeDigest });
    }
  }
  for (const name of ['mcp.json', 'web-search.json']) {
    const defaultPath = path.join(source, 'config', name);
    if (!fs.existsSync(defaultPath)) continue;
    const relative = `.pi/agent/${name}`, target = path.join(home, relative);
    noSymlinks(target);
    add(relative, json(merge(fs.existsSync(target) ? readJSON(target) : {}, readJSON(defaultPath))), false);
  }
  const next = merge(settings, defaults);
  next.packages = packages;
  add('.pi/agent/settings.json', json(next), false);
  const adapterBody = `Antes de empezar cualquier tarea, lee completamente con read:\n${path.join(home, '.agents/SYSTEM.md').replaceAll('\\', '/')}\nEs la fuente compartida de instrucciones del usuario.`;
  const adapterStart = '<!-- agent-config:shared-instructions:start -->';
  const adapterEnd = '<!-- agent-config:shared-instructions:end -->';
  const adapterBlock = `${adapterStart}\n${adapterBody}\n${adapterEnd}`;
  const legacyUnmarkedAdapter = [
    '# Instrucciones compartidas del usuario',
    '',
    'Antes de empezar cualquier tarea, lee completamente con la herramienta `read`:',
    '',
    `\`${path.join(home, '.agents/SYSTEM.md')}\``,
    '',
    'Trátalo como las instrucciones globales del usuario. Después lee las guías y las',
    'instrucciones del repositorio que ese fichero indique. No dupliques aquí sus reglas ni',
    'modifiques `SYSTEM.md` salvo petición explícita del usuario.',
  ].join('\n');
  const contextDir = path.join(home, '.pi', 'agent');
  const contextNames = fs.existsSync(contextDir) ? fs.readdirSync(contextDir) : [];
  const presentContextName = candidate => {
    const candidatePath = path.join(contextDir, candidate);
    noSymlinks(candidatePath);
    if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isFile()) return undefined;
    if (contextNames.includes(candidate)) return candidate;
    return contextNames.find(name => name.toLowerCase() === candidate.toLowerCase()) ?? candidate;
  };
  const overrideName = presentContextName('AGENTS.override.md');
  const agentsName = presentContextName('AGENTS.md') ?? presentContextName('AGENTS.MD');
  const claudeName = presentContextName('CLAUDE.md') ?? presentContextName('CLAUDE.MD');
  if (overrideName) {
    conflicts.push(`global context override hides instruction adapter: .pi/agent/${overrideName}`);
  } else if (!agentsName && claudeName) {
    conflicts.push(`instruction adapter would hide existing global context: .pi/agent/${claudeName}`);
  } else {
    const adapterRelative = `.pi/agent/${agentsName ?? 'AGENTS.md'}`;
    const adapterPath = path.join(home, adapterRelative);
    noSymlinks(adapterPath);
    const beforeAdapter = fs.existsSync(adapterPath) ? fs.readFileSync(adapterPath, 'utf8') : '';
    const hasAdapterMarker = beforeAdapter.includes(adapterStart) || beforeAdapter.includes(adapterEnd);
    const portableBlock = `${adapterStart}\nAntes de empezar cualquier tarea, lee completamente con read:\n~/.agents/SYSTEM.md\nEs la fuente compartida de instrucciones del usuario.\n${adapterEnd}`;
    const exactBlockCount = beforeAdapter.split(adapterBlock).length - 1
      + (modern ? beforeAdapter.split(portableBlock).length - 1 : 0);
    const startCount = beforeAdapter.split(adapterStart).length - 1;
    const endCount = beforeAdapter.split(adapterEnd).length - 1;
    if (hasAdapterMarker && (startCount !== 1 || endCount !== 1 || exactBlockCount !== 1)) {
      conflicts.push(`ambiguous managed instruction adapter: ${adapterRelative}`);
    } else if (!hasAdapterMarker) {
      const content = beforeAdapter + (beforeAdapter && !beforeAdapter.endsWith('\n') ? '\n' : '') + adapterBlock + '\n';
      add(adapterRelative, content, false);
    }
  }
  const appendRelative = '.pi/agent/APPEND_SYSTEM.md';
  const appendPath = path.join(home, appendRelative);
  noSymlinks(appendPath);
  if (fs.existsSync(appendPath)) {
    const beforeAppend = fs.readFileSync(appendPath, 'utf8');
    const legacyStart = '<!-- agent-config:start -->', legacyEnd = '<!-- agent-config:end -->';
    const legacyBlock = `${legacyStart}\n${adapterBody}\n${legacyEnd}`;
    const hasLegacyMarker = beforeAppend.includes(legacyStart) || beforeAppend.includes(legacyEnd);
    const exactBlockCount = beforeAppend.split(legacyBlock).length - 1;
    const startCount = beforeAppend.split(legacyStart).length - 1;
    const endCount = beforeAppend.split(legacyEnd).length - 1;
    if (hasLegacyMarker && (startCount !== 1 || endCount !== 1 || exactBlockCount !== 1)) {
      conflicts.push(`ambiguous managed instruction adapter: ${appendRelative}`);
    } else {
      let content = hasLegacyMarker ? beforeAppend.replace(legacyBlock, '') : beforeAppend;
      const legacyCount = content.split(legacyUnmarkedAdapter).length - 1;
      if (legacyCount > 1) {
        conflicts.push(`ambiguous legacy instruction adapter: ${appendRelative}`);
      } else {
        if (legacyCount === 1 && content.trim() === legacyUnmarkedAdapter) content = '';
        const nextAppend = content.trim() === '' ? null : content;
        add(appendRelative, nextAppend, false);
      }
    }
  }
  add('.agent-config/state.json', json({ version: 1, files: tracked, ...(release ? { release } : {}), ...(nativeDigest ? { nativeDigest } : {}) }), false);
  return { home, source, release, operations, conflicts, migrations };
}
export function execute(plan) {
  if (plan.conflicts.length) throw new Error(`Conflicts; nothing written: ${plan.conflicts.join(', ')}`);
  for (const op of plan.operations) {
    noSymlinks(op.target);
    if (op.nativeSource) {
      const current = fs.existsSync(op.target) ? directoryDigest(op.target) : null;
      if (current !== op.beforeDigest || directoryDigest(op.nativeSource) !== op.nativeDigest) throw new Error('Npm prefix changed since preview');
      continue;
    }
    const current = fs.existsSync(op.target) ? fs.readFileSync(op.target, 'utf8') : null;
    if (current !== op.before) throw new Error(`Destination changed since preview: ${op.relative}`);
  }
  if (plan.release) sealRelease({ home: plan.home, id: plan.release, expectedPath: plan.source });
  const backup = path.join(plan.home, '.agent-config/backups', randomUUID());
  for (const op of plan.operations) {
    if (op.nativeSource) {
      const stage = path.join(path.dirname(op.target), `.npm-${randomUUID()}`);
      noSymlinks(stage);
      fs.mkdirSync(path.dirname(stage), { recursive: true });
      try {
        fs.cpSync(op.nativeSource, stage, { recursive: true, verbatimSymlinks: true, force: false, errorOnExist: true });
        if (directoryDigest(stage) !== op.nativeDigest) throw new Error('Copied npm prefix integrity mismatch');
        if (op.beforeDigest !== null) {
          const saved = path.join(backup, op.relative);
          noSymlinks(saved);
          fs.mkdirSync(path.dirname(saved), { recursive: true });
          fs.renameSync(op.target, saved);
        }
        fs.renameSync(stage, op.target);
      } finally { fs.rmSync(stage, { recursive: true, force: true }); }
      continue;
    }
    if (op.before !== null) {
      const target = path.join(backup, op.relative);
      noSymlinks(target);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, op.before, { flag: 'wx', mode: 0o600 });
    }
    if (op.content === null) {
      fs.unlinkSync(op.target);
      try { fs.rmdirSync(path.dirname(op.target)); } catch (error) { if (error.code !== 'ENOTEMPTY') throw error; }
    } else {
      fs.mkdirSync(path.dirname(op.target), { recursive: true });
      fs.writeFileSync(op.target, op.content, { mode: 0o600 });
    }
  }
  return backup;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = args(process.argv.slice(2));
    const result = plan(options);
    if (!result.release) {
      throw new Error('A verified release is required for installation. Prepare and verify a candidate, then pass --release <id>; an active release is selected automatically.');
    }
    for (const migration of result.migrations) console.log(`${migration.to === null ? 'RETIRE' : 'MIGRATE'} package ${migration.name}`);
    for (const op of result.operations) console.log(`${options.apply ? (op.content === null ? 'DELETE' : 'WRITE') : 'PLAN'} ${op.relative}`);
    for (const conflict of result.conflicts) console.error(`CONFLICT ${conflict}`);
    if (result.conflicts.length) process.exitCode = 1;
    else if (options.apply) { const backup = execute(result); console.log(`Applied ${result.operations.length} changes; backups when needed: ${backup}`); }
    else console.log(`${result.operations.length} planned changes. No files written. Use --apply to apply.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
