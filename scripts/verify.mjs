import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyRelease } from './releases.mjs';
import { verificationEnvironment } from './verify-env.mjs';

export const root = path.resolve(import.meta.dirname, '..');

export function resolveNpmExecPath({ env = process.env, stat = fs.statSync } = {}) {
  const candidate = env.npm_execpath;
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) {
    throw new Error('npm_execpath must be an absolute path; run this command through npm');
  }
  const filename = path.basename(candidate).toLowerCase();
  if (!['npm-cli.js', 'npm-cli.cjs', 'npm.js', 'npm.cjs'].includes(filename)) {
    throw new Error(`Unexpected npm_execpath: ${candidate}`);
  }
  try {
    if (!stat(candidate).isFile()) throw new Error('not a file');
  } catch {
    throw new Error(`npm_execpath is not a readable file: ${candidate}`);
  }
  return candidate;
}

export function planVerification({ source = root } = {}) {
  const manifestPath = path.join(source, 'manifests/packages.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.packages)) throw new Error(`Invalid packages manifest: ${manifestPath}`);

  const checks = [{
    id: 'root',
    label: 'root tests',
    cwd: path.resolve(source),
    commands: [{ label: 'test', args: ['test'] }],
  }];
  for (const pkg of manifest.packages) {
    if (!pkg || typeof pkg.name !== 'string' || !pkg.name || typeof pkg.path !== 'string' || !pkg.path) {
      throw new Error(`Invalid package entry in ${manifestPath}`);
    }
    const cwd = path.resolve(source, pkg.path);
    const relative = path.relative(path.resolve(source), cwd);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
      throw new Error(`Package path escapes repository: ${pkg.path}`);
    }
    checks.push({
      id: pkg.name,
      label: pkg.name,
      cwd,
      commands: [
        { label: 'typecheck', args: ['run', 'typecheck'] },
        { label: 'test', args: ['test'] },
      ],
    });
  }
  return checks;
}

export function runVerification(checks, {
  spawn = spawnSync,
  nodePath = process.execPath,
  npmExecPath = resolveNpmExecPath(),
  env = process.env,
  reporter = console,
} = {}) {
  const results = [];
  const childEnv = verificationEnvironment(env);

  for (const check of checks) {
    let failure;
    for (const command of check.commands) {
      reporter.log(`[verify] ${check.label}: npm ${command.args.join(' ')}`);
      let result;
      try {
        result = spawn(nodePath, [npmExecPath, ...command.args], {
          cwd: check.cwd,
          env: childEnv,
          stdio: 'inherit',
        });
      } catch (error) {
        result = { status: null, error };
      }
      if (result.status !== 0) {
        const reason = result.error?.message ?? `exit ${result.status ?? 'unknown'}`;
        failure = { command: command.label, args: command.args, reason };
        break;
      }
    }
    const item = { ...check, ok: failure === undefined, failure };
    results.push(item);
    reporter[item.ok ? 'log' : 'error'](`[verify] ${item.ok ? 'PASS' : 'FAIL'} ${check.label}`);
  }

  const failed = results.filter(item => !item.ok);
  if (failed.length === 0) {
    reporter.log(`[verify] All ${results.length} checks passed.`);
  } else {
    reporter.error(`[verify] ${failed.length} of ${results.length} checks failed:`);
    for (const item of failed) {
      reporter.error(`- ${item.label}: npm ${item.failure.args.join(' ')} (${item.failure.reason})`);
    }
  }
  return { results, failed };
}

function releaseArgs(argv) {
  let home = os.homedir(), release, apply = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply') apply = true;
    else if (['--home', '--release'].includes(arg) && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      const value = argv[++index];
      if (arg === '--home') home = path.resolve(value);
      else release = value;
    } else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  if (!release) throw new Error('Usage: npm run verify -- --home <home> --release <id> [--apply]');
  return { home: path.resolve(home), id: release, apply };
}

export function main({ argv = process.argv.slice(2), source = root, releaseRunChecks, releaseRunRuntimeChecks, reporter = console, ...runOptions } = {}) {
  if (argv.length !== 0) {
    const result = verifyRelease({ ...releaseArgs(argv), runChecks: releaseRunChecks, runRuntimeChecks: releaseRunRuntimeChecks });
    for (const item of [...result.fullChecks, ...result.runtimeChecks]) reporter[item.ok ? 'log' : 'error'](`[verify-release] ${item.ok ? 'PASS' : 'FAIL'} ${item.id} (${item.durationMs} ms)${item.reason ? ` (${item.reason})` : ''}`);
    reporter.log(`[verify-release] timings: source validation ${result.timings.sourceValidationMs} ms; runtime hashing ${result.timings.runtimeDigestMs} ms; total ${result.timings.totalMs} ms`);
    reporter.log(result.written
      ? `[verify-release] ${result.passed ? 'Recorded valid verification' : 'Recorded failed verification'} for ${result.id}.`
      : `[verify-release] Preview result only; use --apply to record ${result.id} as verified.`);
    return result.passed ? 0 : 1;
  }
  if (path.resolve(source) === root) {
    reporter.log('[verify] Local harness only; external package sources are checked through release verification.');
  }
  const report = runVerification(planVerification({ source }), { reporter, ...runOptions });
  return report.failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[verify] ${error.message}`);
    process.exitCode = 1;
  }
}
