#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_OUTPUT_CHARS = 50_000;
const MAX_OUTPUT_LINES = 2_000;

export function parseWhen(value, now = Date.now()) {
  if (!value) return null;
  const relative = /^(\d+)(m|h|d|w)$/.exec(value);
  if (relative) {
    const units = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
    return new Date(now - Number(relative[1]) * units[relative[2]]);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

export function textContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(part => part && part.type === 'text' && typeof part.text === 'string')
    .map(part => part.text).join('\n');
}

function usageCost(message) {
  const value = message?.usage?.cost?.total;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function timestamp(record) {
  const value = record?.message?.timestamp ?? record?.timestamp;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function summarizeFile(file) {
  const summary = {
    file, id: '', cwd: '', startedAt: null, lastAt: null, providers: new Set(), models: new Set(),
    users: 0, assistants: 0, tools: 0, errors: 0, cost: 0, inputTokens: 0, outputTokens: 0,
    firstPrompt: '', userText: '', isSubagent: fs.existsSync(`${file}.loadout.json`),
  };
  const prompts = [];
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch { return null; }
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    if (record.type === 'session') {
      summary.id = typeof record.id === 'string' ? record.id : summary.id;
      summary.cwd = typeof record.cwd === 'string' ? record.cwd : summary.cwd;
      summary.startedAt = timestamp(record) ?? summary.startedAt;
    } else if (record.type === 'model_change') {
      if (record.provider) summary.providers.add(record.provider);
      if (record.modelId) summary.models.add(record.modelId);
    } else if (record.type === 'message') {
      const message = record.message ?? {};
      summary.lastAt = timestamp(record) ?? summary.lastAt;
      if (message.role === 'user') {
        summary.users++;
        const text = textContent(message.content);
        if (text) {
          if (!summary.firstPrompt) summary.firstPrompt = text;
          prompts.push(text);
        }
      } else if (message.role === 'assistant') {
        summary.assistants++;
        if (message.provider) summary.providers.add(message.provider);
        if (message.model) summary.models.add(message.model);
        summary.cost += usageCost(message);
        summary.inputTokens += Number(message.usage?.input ?? 0) || 0;
        summary.outputTokens += Number(message.usage?.output ?? 0) || 0;
      } else if (message.role === 'toolResult') {
        summary.tools++;
        if (message.isError) summary.errors++;
      }
    }
  }
  if (!summary.id) return null;
  summary.userText = prompts.join('\n');
  return summary;
}

export function discover(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(candidate);
    }
  };
  visit(root);
  return files;
}

function parseArgs(argv) {
  const command = argv.shift();
  if (!['list', 'cost', 'search', 'show', 'prompts'].includes(command)) throw new Error('Usage: analyze-sessions.mjs <list|cost|search|show|prompts> [arguments]');
  const options = { command, root: path.join(os.homedir(), '.pi', 'agent', 'sessions'), limit: 20, includeSubagents: false };
  if (command === 'search' || command === 'show') options.term = argv.shift();
  if (command === 'search' && !options.term) throw new Error('search requires a literal text pattern');
  if (command === 'show' && !options.term) throw new Error('show requires a session id or prefix');
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--include-subagents') options.includeSubagents = true;
    else if (flag === '--include-thinking') options.includeThinking = true;
    else if (['--root', '--since', '--provider', '--model', '--cwd', '--limit', '--by', '--max-chars'].includes(flag)) {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for ${flag}`);
      options[flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    } else throw new Error(`Unknown argument: ${flag}`);
  }
  options.limit = Math.min(200, Math.max(1, Number(options.limit) || 20));
  options.maxChars = Math.min(MAX_OUTPUT_CHARS, Math.max(100, Number(options.maxChars) || 4_000));
  options.since = parseWhen(options.since);
  return options;
}

function selectSessions(options) {
  return discover(path.resolve(options.root)).map(summarizeFile).filter(Boolean).filter(summary => {
    if (!options.includeSubagents && summary.isSubagent) return false;
    if (options.since && summary.startedAt && summary.startedAt < options.since) return false;
    if (options.provider && ![...summary.providers].some(value => value.includes(options.provider))) return false;
    if (options.model && ![...summary.models].some(value => value.includes(options.model))) return false;
    if (options.cwd && !summary.cwd.toLowerCase().includes(options.cwd.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
}

function short(text, max = 120) {
  const oneLine = String(text ?? '').replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

function fmtDate(value) { return value ? value.toISOString().replace('T', ' ').slice(0, 16) : '?'; }
function fmtCost(value) { return `$${value.toFixed(value < 0.01 ? 4 : 2)}`; }

function list(sessions, options) {
  return sessions.slice(0, options.limit).map(summary => [
    fmtDate(summary.startedAt), summary.id.slice(0, 8), summary.isSubagent ? 'subagent' : 'main',
    fmtCost(summary.cost), [...summary.models].join(',') || '?', short(summary.cwd, 45), short(summary.firstPrompt),
  ].join(' | ')).join('\n') || 'No sessions matched.';
}

function cost(sessions, options) {
  const by = options.by ?? 'model';
  if (!['model', 'provider', 'project', 'day', 'total'].includes(by)) throw new Error(`Unsupported cost grouping: ${by}`);
  const groups = new Map();
  for (const summary of sessions) {
    const keys = by === 'model' ? [...summary.models] : by === 'provider' ? [...summary.providers]
      : by === 'project' ? [summary.cwd || '?'] : by === 'day' ? [summary.startedAt?.toISOString().slice(0, 10) ?? '?'] : ['total'];
    for (const key of keys.length ? keys : ['?']) groups.set(key, (groups.get(key) ?? 0) + summary.cost / Math.max(1, keys.length));
  }
  const rows = [...groups].sort((a, b) => b[1] - a[1]).slice(0, options.limit);
  return [`Total: ${fmtCost(sessions.reduce((sum, item) => sum + item.cost, 0))} (${sessions.length} sessions)`,
    ...rows.map(([key, value]) => `${fmtCost(value)} | ${key}`)].join('\n');
}

function readMessages(summary) {
  const records = [];
  for (const line of fs.readFileSync(summary.file, 'utf8').split(/\r?\n/)) {
    try { const record = JSON.parse(line); if (record.type === 'message') records.push(record.message ?? {}); } catch {}
  }
  return records;
}

function search(sessions, options) {
  const needle = options.term.toLowerCase();
  const hits = [];
  for (const summary of sessions) {
    for (const message of readMessages(summary)) {
      if (!['user', 'assistant'].includes(message.role)) continue;
      for (const part of Array.isArray(message.content) ? message.content : []) {
        if (part?.type !== 'text' || typeof part.text !== 'string') continue;
        const index = part.text.toLowerCase().indexOf(needle);
        if (index === -1) continue;
        const start = Math.max(0, index - 100), end = Math.min(part.text.length, index + needle.length + 180);
        hits.push(`${summary.id.slice(0, 8)} | ${message.role} | ${short(part.text.slice(start, end), 300)}`);
        if (hits.length >= options.limit) return hits.join('\n');
      }
    }
  }
  return hits.join('\n') || 'No matches.';
}

function show(sessions, options) {
  const matches = sessions.filter(summary => summary.id === options.term || summary.id.startsWith(options.term));
  if (matches.length !== 1) throw new Error(matches.length ? 'Session prefix is ambiguous.' : 'Session not found.');
  const summary = matches[0], lines = [`# Session ${summary.id}`, `cwd: ${summary.cwd}`, `started: ${fmtDate(summary.startedAt)}`, `cost: ${fmtCost(summary.cost)}`, ''];
  for (const message of readMessages(summary)) {
    if (!['user', 'assistant', 'toolResult'].includes(message.role)) continue;
    lines.push(`## ${message.role}`);
    for (const part of Array.isArray(message.content) ? message.content : []) {
      if (part?.type === 'text') lines.push(short(part.text, options.maxChars));
      else if (part?.type === 'thinking' && options.includeThinking) lines.push(`[thinking] ${short(part.thinking, options.maxChars)}`);
      else if (part?.type === 'toolCall') lines.push(`[tool] ${part.name ?? '?'}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function prompts(sessions, options) {
  const lines = [];
  for (const summary of sessions.slice(0, options.limit)) {
    for (const message of readMessages(summary)) {
      if (message.role !== 'user') continue;
      const text = textContent(message.content);
      if (text) lines.push(`${summary.id.slice(0, 8)} | ${short(text, options.maxChars)}`);
    }
  }
  return lines.join('\n') || 'No prompts matched.';
}

export function boundOutput(text) {
  const lines = text.split('\n');
  let result = lines.slice(0, MAX_OUTPUT_LINES).join('\n');
  if (result.length > MAX_OUTPUT_CHARS) result = result.slice(0, MAX_OUTPUT_CHARS);
  if (result !== text) result += '\n[Output truncated; narrow the filters.]';
  return result;
}

export function run(argv) {
  const options = parseArgs([...argv]);
  let sessions = selectSessions(options);
  if (options.command === 'show') sessions = selectSessions({ ...options, includeSubagents: true });
  const output = options.command === 'list' ? list(sessions, options)
    : options.command === 'cost' ? cost(sessions, options)
    : options.command === 'search' ? search(sessions, options)
    : options.command === 'show' ? show(sessions, options) : prompts(sessions, options);
  return boundOutput(output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(run(process.argv.slice(2))); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
