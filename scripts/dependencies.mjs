import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { root, readJSON } from './install.mjs';
import { installReleaseDependencies } from './releases.mjs';

export function dependencyArgs(argv) {
  let apply = false, home = os.homedir(), release;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply') apply = true;
    else if (['--home', '--release'].includes(arg) && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      const value = argv[++index];
      if (arg === '--home') home = path.resolve(value);
      else release = value;
    } else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  if (!release && home !== os.homedir()) throw new Error('--home requires --release');
  return { apply, home: path.resolve(home), release };
}

export function main({ argv = process.argv.slice(2), runNpm, getNpmVersion } = {}) {
  const options = dependencyArgs(argv);
  if (options.release) {
    const result = installReleaseDependencies({ ...options, id: options.release, runNpm, ...(getNpmVersion ? { getNpmVersion } : {}) });
    for (const command of result.commands) console.log(`${path.relative(result.path, command.cwd)}: npm ${command.args.join(' ')}`);
    console.log(options.apply
      ? `Full development dependencies and reduced runtime prepared for ${options.release}; active settings were not changed.`
      : 'Preview only. --apply authorizes full development and omit-dev runtime npm installs with lifecycle scripts disabled; no models or external binaries are installed by this tool.');
    return 0;
  }

  const manifest = readJSON(path.join(root, 'manifests/packages.json'));
  console.log('Local harness packages only; external package sources are prepared and checked through a release candidate.');
  for (const pkg of manifest.packages) {
    console.log(`${pkg.path}: npm ci --ignore-scripts`);
    if (options.apply) {
      const result = spawnSync('npm', ['ci', '--ignore-scripts'], {
        cwd: path.join(root, pkg.path), stdio: 'inherit', shell: process.platform === 'win32'
      });
      if (result.status !== 0) throw new Error(result.error?.message ?? 'Dependency installation failed');
    }
  }
  if (!options.apply) console.log('Preview only. --apply authorizes package downloads; no lifecycle scripts will run.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
