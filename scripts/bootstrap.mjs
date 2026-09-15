import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from './doctor.mjs';
import { execute, noSymlinks, plan, readJSON, root } from './install.mjs';
import {
  executeRelease,
  installReleaseDependencies,
  planRelease,
  validateRelease,
  verifyRelease,
} from './releases.mjs';

const FULL_SHA = /^[0-9a-f]{40}$/;
const RELEASE_ID = /^h-[0-9a-f]{12}-s-[0-9a-f]{12}-m-[0-9a-f]{12}$/;
const recipePath = path.join(root, 'manifests', 'active-release.json');
const reportRelative = '.release/verification.json';
const dependenciesRelative = '.release/dependencies.json';
const sealRelative = '.release/activation.json';

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateRecipe(recipe, { nodeVersion } = {}) {
  if (!object(recipe) || recipe.schemaVersion !== 1 || !RELEASE_ID.test(recipe.release)
      || typeof recipe.piVersion !== 'string' || !recipe.piVersion
      || !object(recipe.runtime) || !/^v\d+\.\d+\.\d+$/.test(recipe.runtime.node ?? '')
      || (nodeVersion !== undefined && recipe.runtime.node !== nodeVersion)
      || !object(recipe.sources)) {
    throw new Error(`Bootstrap recipe requires Pi version, release id, and exact runtime Node${nodeVersion ? ` ${nodeVersion}` : ''}`);
  }
  for (const key of ['harness', 'subagents', 'memory']) {
    if (!FULL_SHA.test(recipe.sources[key] ?? '')) throw new Error(`Bootstrap recipe has no full ${key} commit`);
  }
  const expected = `h-${recipe.sources.harness.slice(0, 12)}-s-${recipe.sources.subagents.slice(0, 12)}-m-${recipe.sources.memory.slice(0, 12)}`;
  if (recipe.release !== expected) throw new Error(`Bootstrap recipe release does not match its source commits: ${recipe.release}`);
  if (Object.keys(recipe.sources).length !== 3) throw new Error('Bootstrap recipe has unexpected source entries');
  return recipe;
}

export function bootstrapArgs(argv) {
  let home = os.homedir(), sourceMap, apply = false, withRtk = false, migratePackages = false, retireOrcaSkills = false, migrateBase = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply') apply = true;
    else if (arg === '--with-rtk') throw new Error('RTK is retired from this base');
    else if (arg === '--migrate-base') migrateBase = true;
    else if (arg === '--migrate-packages') migratePackages = true;
    else if (arg === '--retire-orca-skills') retireOrcaSkills = true;
    else if (['--home', '--source-map'].includes(arg) && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      const value = argv[++index];
      if (arg === '--home') home = path.resolve(value);
      else sourceMap = path.resolve(value);
    } else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  return { home: path.resolve(home), sourceMap, apply, withRtk, migratePackages, retireOrcaSkills, migrateBase };
}

export function readSourceMap(file) {
  const mapped = readJSON(file);
  const base = path.dirname(file);
  const repositories = {};
  for (const key of ['harness', 'subagents', 'memory']) {
    if (typeof mapped[key] !== 'string' || !mapped[key]) throw new Error(`Source map is missing ${key}`);
    repositories[key] = path.resolve(base, mapped[key]);
  }
  if (Object.keys(mapped).length !== 3) throw new Error('Source map has unexpected entries');
  return repositories;
}

function activeRelease(home) {
  const state = path.join(home, '.agent-config', 'state.json');
  for (let current = path.resolve(state); current !== path.dirname(current); current = path.dirname(current)) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink path not allowed: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!fs.existsSync(state)) return undefined;
  const value = readJSON(state);
  if (value.release !== undefined && typeof value.release !== 'string') throw new Error('Invalid active release in installer state');
  return value.release;
}

function assertCandidate(candidate, recipe) {
  if (candidate.id !== recipe.release || candidate.manifest.piVersion !== recipe.piVersion) {
    throw new Error(`Candidate does not match bootstrap recipe ${recipe.release}`);
  }
  for (const key of ['harness', 'subagents', 'memory']) {
    if (candidate.manifest.sources[key]?.commit !== recipe.sources[key]) {
      throw new Error(`Candidate source does not match bootstrap recipe: ${key}`);
    }
  }
}

function checkDoctor(checks, { pendingWritesAllowed = false } = {}) {
  const failed = checks.filter(check => !check.ok
    && !(pendingWritesAllowed && check.message.startsWith('Pending configuration writes:')));
  if (failed.length) throw new Error(`Doctor failed: ${failed.map(check => check.message).join('; ')}`);
}

function installationOptions(options, release) {
  return {
    home: options.home,
    release,
    withRtk: options.withRtk,
    migratePackages: options.migratePackages,
    retireOrcaSkills: options.retireOrcaSkills,
    migrateBase: options.migrateBase,
  };
}

export function runBootstrap({
  options,
  recipe = validateRecipe(readJSON(recipePath)),
  repositories,
  runNpm,
  getNpmVersion,
  runChecks,
  runRuntimeChecks,
  doctorSpawn,
  reporter = console,
} = {}) {
  validateRecipe(recipe, { nodeVersion: process.version });
  const targetPath = path.join(options.home, '.agent-config', 'releases', recipe.release);
  const current = activeRelease(options.home);
  const targetExists = fs.existsSync(targetPath);

  if (current === recipe.release) {
    const candidate = validateRelease({ home: options.home, id: recipe.release, requireVerified: true });
    assertCandidate(candidate, recipe);
    if (!fs.existsSync(path.join(candidate.path, sealRelative))) {
      throw new Error(`Active release is not sealed: ${recipe.release}`);
    }
    const planned = plan(installationOptions(options, recipe.release));
    const before = inspect({ ...installationOptions(options, recipe.release), spawn: doctorSpawn });
    checkDoctor(before, { pendingWritesAllowed: planned.operations.length > 0 });
    if (options.apply && planned.operations.length > 0) execute(planned);
    const after = options.apply && planned.operations.length > 0
      ? inspect({ ...installationOptions(options, recipe.release), spawn: doctorSpawn })
      : before;
    if (options.apply && planned.operations.length > 0) checkDoctor(after);
    reporter.log(`Release ${recipe.release} is already active, verified, and valid; dependency and verification stages were skipped.`);
    reporter.log(`${planned.operations.length} ${options.apply ? 'applied' : 'planned'} configuration changes.`);
    return { status: 'active', candidate, planned, checks: after, written: options.apply && planned.operations.length > 0 };
  }

  let candidate;
  if (!targetExists) {
    if (!repositories) throw new Error(`Release ${recipe.release} is not prepared; provide --source-map <local-json>`);
    const releasePlan = planRelease({ home: options.home, repositories, commits: recipe.sources });
    if (releasePlan.id !== recipe.release || releasePlan.manifest.piVersion !== recipe.piVersion) {
      throw new Error('Prepared source plan does not match the bootstrap recipe');
    }
    if (!options.apply) {
      reporter.log(`PLAN release ${recipe.release} from the three locked commits.`);
      reporter.log('No files written. --apply will prepare dependencies, verify the candidate, run doctor/plan, and only then activate it.');
      return { status: 'unprepared', releasePlan, written: false };
    }
    executeRelease(releasePlan);
    candidate = validateRelease({ home: options.home, id: recipe.release });
  } else {
    candidate = validateRelease({ home: options.home, id: recipe.release });
  }
  assertCandidate(candidate, recipe);

  const seal = path.join(candidate.path, sealRelative);
  const dependencyReport = path.join(candidate.path, dependenciesRelative);
  const verificationReport = path.join(candidate.path, reportRelative);
  const sealed = fs.existsSync(seal);
  if (sealed) {
    candidate = validateRelease({ home: options.home, id: recipe.release, requireVerified: true });
  } else {
    if (!fs.existsSync(dependencyReport)) {
      if (!options.apply) {
        reporter.log(`Release ${recipe.release} is prepared but dependencies are pending. No files written.`);
        return { status: 'needs-dependencies', candidate, written: false };
      }
      installReleaseDependencies({
        home: options.home, id: recipe.release, apply: true, runNpm,
        ...(getNpmVersion ? { getNpmVersion } : {}),
      });
    } else {
      const alreadyVerified = fs.existsSync(verificationReport) && readJSON(verificationReport).status === 'passed';
      validateRelease({ home: options.home, id: recipe.release, requireDependencies: true, requireVerified: alreadyVerified });
    }

    let verified = false;
    if (fs.existsSync(verificationReport)) {
      const report = readJSON(verificationReport);
      if (report.status === 'passed') {
        candidate = validateRelease({ home: options.home, id: recipe.release, requireVerified: true });
        verified = true;
      } else if (report.status !== 'failed') {
        throw new Error(`Invalid verification status for ${recipe.release}`);
      }
    }
    if (!verified) {
      if (!options.apply) {
        reporter.log(`Release ${recipe.release} has dependencies but verification is pending. No checks run and no files written.`);
        return { status: 'needs-verification', candidate, written: false };
      }
      const verification = verifyRelease({
        home: options.home, id: recipe.release, apply: true, runChecks, runRuntimeChecks,
      });
      if (!verification.passed) throw new Error(`Verification failed; release ${recipe.release} was not activated`);
      candidate = validateRelease({ home: options.home, id: recipe.release, requireVerified: true });
    }
  }

  const installOptions = installationOptions(options, recipe.release);
  const planned = plan(installOptions);
  const before = inspect({ ...installOptions, spawn: doctorSpawn });
  checkDoctor(before, { pendingWritesAllowed: true });
  if (!options.apply) {
    reporter.log(`PLAN activation of verified release ${recipe.release}: ${planned.operations.length} configuration changes. No files written.`);
    return { status: 'ready', candidate, planned, checks: before, written: false };
  }
  execute(planned);
  const after = inspect({ ...installOptions, spawn: doctorSpawn });
  checkDoctor(after);
  reporter.log(`Activated ${recipe.release}; ${planned.operations.length} configuration changes applied.`);
  return { status: 'activated', candidate, planned, checks: after, written: true };
}

export const bootstrapUsage = `Usage:
  npm run bootstrap -- [--home <home>] [--source-map <local-json>] [--migrate-base] [--migrate-packages] [--retire-orca-skills] [--apply]

Preview is the default and never prepares dependencies or runs release verification. Relative repository paths in the local source map are resolved from that JSON file. --apply is required to prepare and activate the locked release. An already matching active release is only validated with doctor/plan; its sealed dependencies and verification are never rerun.`;

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help')) { console.log(bootstrapUsage); return 0; }
  const options = bootstrapArgs(argv);
  const recipe = validateRecipe(readJSON(recipePath), { nodeVersion: process.version });
  let repositories = options.sourceMap ? readSourceMap(options.sourceMap) : undefined;
  if (!repositories && !fs.existsSync(path.join(options.home, '.agent-config/releases', recipe.release))) {
    if (!options.apply) {
      console.log(`PLAN ${recipe.release}: fetch pinned sources, prepare, verify and activate. No files written.`);
      return 0;
    }
    repositories = { harness: root };
    for (const [key, repository] of Object.entries({ subagents: 'tintinweb/pi-subagents', memory: 'igalarey/pi-observational-memory' })) {
      const destination = path.join(options.home, '.agent-config/sources', `${key}-${recipe.sources[key]}`);
      noSymlinks(destination);
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const staging = fs.mkdtempSync(path.join(path.dirname(destination), '.fetch-'));
        try {
          for (const command of [['init', staging], ['-C', staging, 'fetch', '--depth=1', `https://github.com/${repository}.git`, recipe.sources[key]],
            ['-C', staging, 'checkout', '--detach', 'FETCH_HEAD']]) {
            const child = spawnSync('git', command, { stdio: 'inherit', shell: false });
            if (child.status !== 0) throw new Error(`Unable to prepare pinned ${key} source`);
          }
          fs.renameSync(staging, destination);
        } finally { fs.rmSync(staging, { recursive: true, force: true }); }
      }
      repositories[key] = destination;
    }
  }
  runBootstrap({ options, recipe, repositories });
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
