import { isDeepStrictEqual } from 'node:util';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Inputs are parsed JSON; undefined denotes an absent file. Never change the legacy file:
// adapter 7 reads its servers at lower precedence and ignores its adapter-only keys.
export function planMcpConfigMigration({ legacyConfig, adapterConfig, defaults = {} } = {}) {
  const conflicts = [];
  for (const [label, config] of [['legacy', legacyConfig], ['adapter', adapterConfig], ['defaults', defaults]]) {
    if (config === undefined) continue;
    if (!record(config)) {
      conflicts.push(`${label}: expected a configuration object`);
      continue;
    }
    for (const key of ['settings', 'mcpServers', 'mcp-servers', 'scriptTools']) {
      if (Object.hasOwn(config, key) && !record(config[key])) conflicts.push(`${label}.${key}: expected an object`);
    }
    for (const key of ['imports', 'claudePlugins']) {
      if (Object.hasOwn(config, key) && !Array.isArray(config[key])) conflicts.push(`${label}.${key}: expected an array`);
    }
    for (const key of ['jev', 'scriptMode', 'scriptSkill']) {
      if (record(config.settings) && Object.hasOwn(config.settings, key)) {
        conflicts.push(`${label}.settings.${key}: removed by adapter 7; resolve explicitly before migration`);
      }
    }
  }
  // The retained mcp.json also passes through Pi's translator. These keys can inject
  // adapter fields at lower precedence that were absent from the legacy entry.
  if (record(legacyConfig?.mcpServers)) {
    for (const [name, server] of Object.entries(legacyConfig.mcpServers)) {
      if (!record(server)) continue;
      for (const key of ['enabled', 'exposure', 'toolExposure', 'timeout']) {
        if (Object.hasOwn(server, key)) conflicts.push(`legacy.mcpServers.${name}.${key}: Pi-native translation requires explicit resolution`);
      }
    }
  }
  if (conflicts.length) return { action: 'conflict', conflicts };

  if (adapterConfig !== undefined) {
    const compare = (old, current, location) => {
      if (record(old) && record(current)) {
        for (const [key, value] of Object.entries(old)) {
          if (!Object.hasOwn(current, key)) conflicts.push(`${location}.${key}: absent from existing destination`);
          else compare(value, current[key], `${location}.${key}`);
        }
      } else if (!isDeepStrictEqual(old, current)) conflicts.push(`${location}: differs from existing destination`);
    };
    compare(legacyConfig ?? {}, adapterConfig, 'mcp-adapter.json');
    return conflicts.length ? { action: 'conflict', conflicts }
      : { action: 'adopt', content: structuredClone(adapterConfig), conflicts };
  }

  const fill = (fallback, value) => Object.fromEntries([
    ...Object.entries(fallback).map(([key, entry]) => [key,
      Object.hasOwn(value, key) ? record(entry) && record(value[key]) ? fill(entry, value[key]) : value[key] : entry]),
    ...Object.entries(value).filter(([key]) => !Object.hasOwn(fallback, key)),
  ]);
  return { action: 'create', content: structuredClone(fill(defaults, legacyConfig ?? {})), conflicts };
}
