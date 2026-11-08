import { fileURLToPath } from 'node:url';
import { NAMES, scope } from './policy.mjs';

export default function researchBridge(pi) {
  const provider = fileURLToPath(new URL('./provider.ts', import.meta.url));
  const register = () => {
    const names = process.env.PI_SUBAGENT_AGENT || process.env.PI_SUBAGENT_SESSION ? scope().names : NAMES;
    const registry = globalThis[Symbol.for('pi.subagents.tool-extension-registry')];
    if (typeof registry?.registerToolExtension !== 'function') return;
    for (const name of names) registry.registerToolExtension(name, provider);
  };
  register();
  pi.on('session_start', register);
}
