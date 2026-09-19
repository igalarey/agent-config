#!/usr/bin/env node

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyHarnessCompatibility } from './harness-compatibility.mjs';

export function compatibilityArgs(argv) {
  let home = os.homedir();
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--home' && argv[index + 1] && !argv[index + 1].startsWith('--')) home = path.resolve(argv[++index]);
    else throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
  }
  return { home: path.resolve(home) };
}

export function main({ argv = process.argv.slice(2), reporter = console, ...options } = {}) {
  const result = verifyHarnessCompatibility({ ...compatibilityArgs(argv), ...options });
  if (!result.ok) {
    reporter.error(`Pi harness compatibility: FAIL (${result.failures.length} failures)`);
    for (const failure of result.failures) reporter.error(`- ${failure}`);
    return 1;
  }
  const inventory = result.inventory;
  reporter.log(`Pi harness compatibility: PASS (${result.checks.length} checks)`);
  reporter.log(`Pi ${inventory.release.piVersion}; ${inventory.native.packages.length} npm packages; ${inventory.localPackages.length} local packages; ${inventory.curatedSkills.length} curated skills`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(`Pi harness compatibility: FAIL (1 failure)\n- ${error.message}`);
    process.exitCode = 1;
  }
}
