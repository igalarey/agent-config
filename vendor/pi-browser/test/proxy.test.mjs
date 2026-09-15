import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createBrowserProxy } from '../browser-proxy.ts';
import { buildTestPolicy } from '../policy.ts';

function request(proxy, url, authenticated = true) {
  const address = new URL(proxy.server);
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      host: address.hostname, port: address.port, path: url,
      headers: authenticated ? { 'proxy-authorization': `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}` } : {},
      timeout: 2_000,
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, text }));
    });
    outgoing.on('timeout', () => outgoing.destroy(new Error('Fixture timeout')));
    outgoing.on('error', reject);
    outgoing.end();
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

function connect(proxy, authority, authenticated = true) {
  const address = new URL(proxy.server);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: address.hostname, port: Number(address.port) });
    socket.setTimeout(2_000, () => socket.destroy(new Error('Fixture timeout')));
    socket.on('error', reject);
    socket.once('connect', () => socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${authenticated
      ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}\r\n` : ''}\r\n`));
    let data = '';
    socket.on('data', chunk => {
      data += chunk.toString();
      if (data.includes('\r\n\r\n')) {
        socket.destroy();
        resolve(data.split('\r\n')[0]);
      }
    });
  });
}

test('proxy requires authentication and never forwards credentials or unapproved HTTP requests', async t => {
  const received = [];
  const upstream = http.createServer((req, res) => {
    received.push({ url: req.url, authorization: req.headers['proxy-authorization'] });
    res.end('local fixture');
  });
  const port = await listen(upstream);
  t.after(() => { upstream.closeAllConnections(); return new Promise(resolve => upstream.close(resolve)); });
  const origin = `http://127.0.0.1:${port}`;
  const proxy = await createBrowserProxy(await buildTestPolicy([origin]));
  t.after(() => proxy.close());
  assert.equal((await request(proxy, `${origin}/denied`, false)).status, 407);
  assert.equal((await request(proxy, `http://localhost:${port}/denied`)).status, 403);
  assert.equal((await request(proxy, `http://user:password@127.0.0.1:${port}/denied`)).status, 403);
  assert.deepEqual(received, []);
  assert.deepEqual(await request(proxy, `${origin}/allowed?q=fixture`), { status: 200, text: 'local fixture' });
  assert.deepEqual(received, [{ url: '/allowed?q=fixture', authorization: undefined }]);
});

test('proxy close prevents a CONNECT whose DNS policy decision is still pending', async t => {
  let accepted = 0;
  let releasePolicy;
  let policyStarted;
  const started = new Promise(resolve => { policyStarted = resolve; });
  const decision = new Promise(resolve => { releasePolicy = resolve; });
  const upstream = net.createServer(socket => { accepted++; socket.destroy(); });
  const port = await listen(upstream);
  t.after(() => new Promise(resolve => upstream.close(resolve)));
  const policy = {
    mode: 'test-local', browserOrigins: [], chromiumArgs: [], allowsUrlShape: () => true,
    resolveTarget: async () => { throw new Error('unused'); },
    resolveConnect: async () => {
      policyStarted();
      await decision;
      return { hostname: 'fixture', port, pinnedAddress: '127.0.0.1', family: 4 };
    },
  };
  const proxy = await createBrowserProxy(policy);
  const address = new URL(proxy.server);
  const client = net.connect({ host: address.hostname, port: Number(address.port) });
  const clientClosed = new Promise(resolve => client.once('close', resolve));
  client.once('connect', () => client.write(`CONNECT fixture:443 HTTP/1.1\r\nHost: fixture:443\r\nProxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}\r\n\r\n`));
  await started;
  const closing = proxy.close();
  releasePolicy();
  await Promise.all([closing, clientClosed]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(accepted, 0);
});

test('proxy CONNECT requires both authentication and an approved HTTPS authority', async t => {
  let accepted = 0;
  const upstream = net.createServer(socket => { accepted++; socket.on('error', () => {}); socket.end(); });
  const port = await listen(upstream);
  t.after(() => new Promise(resolve => upstream.close(resolve)));
  const proxy = await createBrowserProxy(await buildTestPolicy([`https://127.0.0.1:${port}`]));
  t.after(() => proxy.close());
  assert.match(await connect(proxy, `127.0.0.1:${port}`, false), /407/);
  assert.match(await connect(proxy, `localhost:${port}`), /403/);
  assert.equal(accepted, 0);
  assert.match(await connect(proxy, `127.0.0.1:${port}`), /200/);
  assert.equal(accepted, 1);
  await proxy.close();
  await proxy.close();
});
