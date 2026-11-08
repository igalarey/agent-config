import fs from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';

export const NAMES = Object.freeze(['web_search', 'fetch_content', 'get_search_content', 'source_check']);
export const refuse = capability => { throw new Error(`Research capability unavailable: ${capability}`); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function readObject(file, capability) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 65536) refuse(capability);
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!object(value)) refuse(capability);
    return value;
  } catch { refuse(capability); }
}
export function scope() {
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  const session = process.env.PI_SUBAGENT_SESSION;
  const agent = process.env.PI_SUBAGENT_AGENT;
  if (!agent || !session || !path.isAbsolute(session) || !agentDir || !path.isAbsolute(agentDir)) refuse('saved child scope');
  const saved = readObject(`${session}.loadout.json`, 'saved child scope');
  if (saved.agent !== agent || saved.agentDir !== agentDir || typeof saved.toolAllowlist !== 'string') refuse('saved child scope');
  const tools = saved.toolAllowlist.split(',');
  if (tools.length > 128 || tools.some(name => !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) || new Set(tools).size !== tools.length) refuse('saved child scope');
  const names = NAMES.filter(name => tools.includes(name));
  if (!names.length) refuse('saved child scope');
  return { agentDir, session, agent, names, tools };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const configKeys = new Set(['workflow', 'toolActivation', 'allowBrowserCookies', 'githubClone', 'pdf', 'fetchRouting', 'searchProvider', 'braveApiKey', 'searxngBaseUrl']);
export function policy(agentDir) {
  if (process.env.PI_CODING_AGENT_DIR !== agentDir) refuse('personal policy directory');
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/COOKIE|PROXY/i.test(key) && value && !['0', 'false'].includes(value)) refuse('personal policy environment');
    if (/^(BRAVE_BASE_URL|SEARXNG_BASE_URL|PI_WEB_ACCESS_ALLOW_HTTP_BASE_URLS)$/i.test(key) && value) refuse('personal policy endpoint override');
    if (/^(BRAVE_API_KEY)$/i.test(key)) env[key] = value;
  }
  const config = readObject(path.join(agentDir, 'web-search.json'), 'personal policy configuration');
  if (Object.keys(config).some(key => !configKeys.has(key))
    || config.workflow !== 'none' || config.allowBrowserCookies !== false
    || !same(config.githubClone, { enabled: false }) || !same(config.pdf, { provider: 'unpdf' })
    || !same(config.fetchRouting, { providers: ['http'], allowRemoteHostedProviders: false })
    || !['dynamic', 'eager', undefined].includes(config.toolActivation)) refuse('personal policy settings');
  if (config.searchProvider !== undefined && !['brave', 'searxng'].includes(config.searchProvider)) refuse('personal policy search provider');
  if (config.braveApiKey !== undefined && (typeof config.braveApiKey !== 'string' || /^[!$]/.test(config.braveApiKey.trim()))) refuse('personal policy credential source');
  if (config.searxngBaseUrl !== undefined) publicUrl(config.searxngBaseUrl);
  return { config, fingerprint: createHash('sha256').update(JSON.stringify({ config, env })).digest('hex') };
}
export function publicUrl(value) {
  let url;
  try { url = new URL(value); } catch { refuse('public HTTP URL'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (typeof value !== 'string' || value.length > 2048 || !['http:', 'https:'].includes(url.protocol)
    || url.username || url.password || isIP(host) || !host.includes('.')
    || /(^|\.)(localhost|local|internal|test|invalid|youtube\.com|youtube-nocookie\.com|youtu\.be|github\.com)$/.test(host)
    || /\.(mp4|webm|mov|avi|mkv|mp3|wav|png|jpe?g|gif|webp|svg)$/i.test(url.pathname)) refuse('public HTTP URL');
  return value;
}
const string = (max = 2000) => ({ type: 'string', minLength: 1, maxLength: max });
const integer = (maximum, minimum = 0) => ({ type: 'integer', minimum, maximum });
const array = (items, maxItems) => ({ type: 'array', items, minItems: 1, maxItems });
const enumeration = values => ({ type: 'string', enum: values });
const search = { queries: array(string(), 4), numResults: integer(10, 1), recencyFilter: enumeration(['day', 'week', 'month', 'year']), domainFilter: array(string(253), 10) };
export const SCHEMAS = {
  web_search: { type: 'object', properties: { query: string(), ...search }, additionalProperties: false },
  source_check: { type: 'object', properties: { claim: string(), ...search }, required: ['claim'], additionalProperties: false },
  fetch_content: { type: 'object', properties: { url: string(2048), urls: array(string(2048), 4), mode: enumeration(['readable', 'raw']) }, additionalProperties: false },
  get_search_content: { type: 'object', properties: { responseId: string(128), queryIndex: integer(100), urlIndex: integer(100), offset: integer(1000000), limit: integer(20000, 1), findText: string(500), findMode: enumeration(['exact', 'case-insensitive', 'fuzzy']) }, required: ['responseId'], additionalProperties: false },
};
function validate(value, schema) {
  if (schema.type === 'string') return typeof value === 'string' && value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity) && (!schema.enum || schema.enum.includes(value));
  if (schema.type === 'integer') return Number.isSafeInteger(value) && value >= schema.minimum && value <= schema.maximum;
  if (schema.type === 'array') return Array.isArray(value) && value.length >= schema.minItems && value.length <= schema.maxItems && value.every(item => validate(item, schema.items));
  return object(value) && Object.keys(value).every(key => Object.hasOwn(schema.properties, key) && validate(value[key], schema.properties[key])) && (schema.required ?? []).every(key => Object.hasOwn(value, key));
}
export function argumentsFor(name, args, config) {
  if (!validate(args, SCHEMAS[name])) refuse(`${name} arguments`);
  const result = structuredClone(args);
  if (name === 'web_search' || name === 'source_check') {
    if (name === 'web_search' && Number(!!args.query) + Number(!!args.queries) !== 1) refuse('web_search query');
    result.provider = config.searchProvider ?? 'openai';
    if (name === 'web_search') {
      result.queries = args.queries ?? [args.query];
      delete result.query;
      result.workflow = 'none';
      result.includeContent = false;
    }
    else result.fetchContent = false;
  }
  if (name === 'fetch_content') {
    if (Number(!!args.url) + Number(!!args.urls) !== 1) refuse('fetch_content URL');
    for (const url of args.urls ?? [args.url]) publicUrl(url);
    result.mode ??= 'readable';
  }
  return result;
}
