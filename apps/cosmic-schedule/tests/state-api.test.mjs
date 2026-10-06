import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createStateApi } from '../server/state-api.mjs';
import { createAccessControl } from '../server/access-control.mjs';
import { MAX_STATE_BYTES } from '../server/state-store.mjs';

const credentials = {
  username: 'writer@example.com',
  password: 'example-writer-password',
  viewerUsername: 'viewer@example.com',
  viewerPassword: 'example-viewer-password',
};
const authenticate = createAccessControl(credentials);
const writer = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
const viewer = `Basic ${Buffer.from(`${credentials.viewerUsername}:${credentials.viewerPassword}`).toString('base64')}`;

async function request(api, method, { authorization, body, rawBody, headers: extraHeaders = {} } = {}) {
  const raw = rawBody ?? (body === undefined ? '' : JSON.stringify(body));
  const req = Readable.from(raw ? [Buffer.from(raw)] : []);
  req.method = method;
  req.headers = {
    ...(authorization ? { authorization } : {}),
    ...(raw ? { 'content-length': String(Buffer.byteLength(raw)) } : {}),
    ...extraHeaders,
  };
  const headers = {};
  let responseBody = '';
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(chunk = '') { responseBody += chunk.toString(); },
  };
  await api(req, res);
  return { statusCode: res.statusCode, headers, body: responseBody ? JSON.parse(responseBody) : null };
}

test('viewer can read shared state but cannot write it', async () => {
  let writes = 0;
  const store = {
    get: () => ({ revision: 7, state: { version: 4 }, updatedAt: null }),
    put: () => { writes += 1; return { status: 'saved', revision: 8, state: { version: 4 } }; },
  };
  const api = createStateApi(store, { authenticate });
  const read = await request(api, 'GET', { authorization: viewer });
  assert.equal(read.statusCode, 200);
  assert.equal(read.body.readOnly, true);
  assert.equal(read.body.revision, 7);

  const write = await request(api, 'PUT', {
    authorization: viewer,
    body: { syncProtocol: 2, revision: 7, state: { version: 4 } },
  });
  assert.equal(write.statusCode, 403);
  assert.deepEqual(write.body, { error: 'read_only' });
  assert.equal(writes, 0);
});

test('the configured writer retains write access', async () => {
  let saved;
  const store = {
    get: () => ({ revision: 0, state: null, updatedAt: null }),
    put: (revision, state) => { saved = { revision, state }; return { status: 'saved', revision: 1, state }; },
  };
  const api = createStateApi(store, { authenticate });
  const response = await request(api, 'PUT', {
    authorization: writer,
    body: { syncProtocol: 2, revision: 0, state: { version: 4 } },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.revision, 1);
  assert.equal(response.body.syncProtocol, 2);
  assert.deepEqual(saved, { revision: 0, state: { version: 4 } });
  assert.equal((await request(api, 'GET', { authorization: writer })).body.readOnly, false);
});

test('anonymous and unrecognized credentials cannot read or write shared state', async () => {
  let reads = 0;
  let writes = 0;
  const api = createStateApi({
    get: () => { reads += 1; return { revision: 7, state: { private: true } }; },
    put: () => { writes += 1; return { status: 'saved' }; },
  }, { authenticate });
  for (const authorization of [undefined, 'Bearer example-token', `Basic ${Buffer.from('writer@example.com:wrong-password').toString('base64')}`]) {
    for (const method of ['GET', 'PUT']) {
      const response = await request(api, method, {
        authorization,
        body: method === 'PUT' ? { syncProtocol: 2, revision: 7, state: { version: 4 } } : undefined,
      });
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.body, { error: 'authentication_required' });
      assert.match(response.headers['www-authenticate'], /^Basic /);
    }
  }
  const forgedProxy = await request(api, 'GET', { headers: {
    'cf-access-authenticated-user-email': 'writer@example.com',
    'cf-access-jwt-assertion': 'header.eyJlbWFpbCI6IndyaXRlckBleGFtcGxlLmNvbSJ9.signature',
  } });
  assert.equal(forgedProxy.statusCode, 401);
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test('the API fails closed when no trusted authentication callback is configured', async () => {
  const api = createStateApi({
    get: () => { throw new Error('anonymous read reached the store'); },
    put: () => { throw new Error('anonymous write reached the store'); },
  });
  for (const method of ['GET', 'PUT']) {
    const response = await request(api, method, { authorization: writer });
    assert.equal(response.statusCode, 401);
  }
});

test('legacy clients cannot resurrect deleted data even with the latest revision', async () => {
  let writes = 0;
  const api = createStateApi({
    get: () => ({ revision: 108, state: {}, updatedAt: null }),
    put: () => { writes++; return { status: 'saved' }; },
  }, { authenticate });
  const response = await request(api, 'PUT', {
    authorization: writer,
    body: { revision: 108, state: { version: 4 } },
  });
  assert.equal(response.statusCode, 426);
  assert.equal(response.body.error, 'update_required');
  assert.equal(writes, 0);
  assert.equal((await request(api, 'GET', { authorization: writer })).body.syncProtocol, 2);
});

test('stale revisions return the current snapshot so the client can recover', async () => {
  const current = { status: 'conflict', revision: 9, state: { version: 4 }, updatedAt: '2026-09-19T00:00:00.000Z' };
  const api = createStateApi({ get: () => current, put: () => current }, { authenticate });
  const response = await request(api, 'PUT', { authorization: writer, body: { syncProtocol: 2, revision: 8, state: { version: 4 } } });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, { ...current, syncProtocol: 2 });
});

test('malformed and oversized request bodies never reach storage', async () => {
  let writes = 0;
  const api = createStateApi({ get: () => ({}), put: () => { writes += 1; return { status: 'saved' }; } }, { authenticate });
  const malformed = await request(api, 'PUT', { authorization: writer, rawBody: '{invalid-json' });
  assert.equal(malformed.statusCode, 400);
  assert.deepEqual(malformed.body, { error: 'invalid_json' });
  const declaredTooLarge = await request(api, 'PUT', { authorization: writer, headers: { 'content-length': String(MAX_STATE_BYTES + 1) } });
  assert.equal(declaredTooLarge.statusCode, 413);
  const streamedTooLarge = await request(api, 'PUT', { authorization: writer, rawBody: 'x'.repeat(MAX_STATE_BYTES + 1), headers: { 'content-length': '0' } });
  assert.equal(streamedTooLarge.statusCode, 413);
  assert.equal(writes, 0);
});

test('disk failures return a retryable error and log no request contents or private paths', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => { logs.push(args); });
  const api = createStateApi({
    get: () => ({ revision: 0, state: null }),
    put: () => { throw Object.assign(new Error('private-path-and-plan-contents'), { code: 'ENOSPC' }); },
  }, { authenticate });
  const response = await request(api, 'PUT', { authorization: writer, body: { syncProtocol: 2, revision: 0, state: { private: true } } });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: 'storage_error' });
  assert.deepEqual(logs, [['Planner storage write failed:', 'ENOSPC']]);
});
