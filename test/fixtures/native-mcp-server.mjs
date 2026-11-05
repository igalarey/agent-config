import readline from 'node:readline';
import fs from 'node:fs';

const log = process.argv[2];
const schema = { type: 'object', properties: {} };
const tools = [
  { name: 'execute', description: 'Synthetic approval request; no real action', inputSchema: schema },
  { name: 'call', description: 'Synthetic call', inputSchema: schema },
  { name: 'resume', description: 'Synthetic resume', inputSchema: { type: 'object', properties: {
    requestId: { type: 'string' }, response: { type: 'object' },
  }, required: ['requestId', 'response'] } },
];
for await (const line of readline.createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.id === undefined) continue;
  let result;
  if (request.method === 'initialize') result = { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'Executor', version: 'fixture' } };
  else if (request.method === 'tools/list') result = { tools };
  else if (request.method === 'ping') result = {};
  else if (request.method === 'tools/call') {
    fs.appendFileSync(log, JSON.stringify(request.params) + '\n');
    result = request.params.name === 'resume'
      ? { content: [{ type: 'text', text: 'FAKE_EXECUTOR_FINISHED' }], structuredContent: { action: request.params.arguments.response.action } }
      : { content: [{ type: 'text', text: 'Synthetic approval pending' }], structuredContent: {
        status: 'approval-required', requestId: 'FIXTURE_PRIVATE_PAUSE_ID',
        elicitation: { mode: 'form', message: 'Approve synthetic fixture only?', requestedSchema: schema },
      } };
  } else {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Not supported by fixture' } }) + '\n');
    continue;
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
}
