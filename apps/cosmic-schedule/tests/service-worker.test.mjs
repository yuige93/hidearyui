import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function fixture({ failCacheWrite = false } = {}) {
  const scope = 'https://demo.example/hidearyui/cosmic-schedule/';
  const listeners = {};
  const contents = new Map();
  const deleted = [];
  let offline = false;
  const key = (request) => typeof request === 'string' ? request : request.url;
  const cache = {
    addAll: async (urls) => {
      for (const url of urls) contents.set(url, new Response(url === scope
        ? '<script src="./assets/app.js"></script><link href="./assets/app.css">'
        : 'asset'));
    },
    match: async (request) => contents.get(key(request))?.clone(),
    put: async (request, response) => {
      if (failCacheWrite) throw new Error('QuotaExceededError');
      contents.set(key(request), response.clone());
    },
  };
  const caches = {
    open: async () => cache,
    match: cache.match,
    keys: async () => [
      `cosmic-shell-v0.1.0:${scope}`,
      'cosmic-shell-v0.1.0:https://demo.example/another-product/',
      'unrelated-app-cache',
    ],
    delete: async (name) => { deleted.push(name); return true; },
  };
  vm.runInNewContext(source, {
    URL, Response, caches,
    fetch: async () => { if (offline) throw new Error('offline'); return new Response('online'); },
    self: {
      registration: { scope },
      addEventListener: (name, listener) => { listeners[name] = listener; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
  });
  async function lifecycle(name) {
    let task;
    listeners[name]({ waitUntil: (promise) => { task = promise; } });
    await task;
  }
  async function request(url, mode = 'navigate', method = 'GET') {
    let result;
    listeners.fetch({ request: { url, mode, method }, respondWith: (promise) => { result = promise; } });
    return result === undefined ? undefined : await result;
  }
  return { scope, contents, deleted, lifecycle, request, goOffline: () => { offline = true; } };
}

test('installation includes the current hashed bundle for offline startup', async () => {
  const f = fixture();
  await f.lifecycle('install');
  assert.equal(f.contents.has(`${f.scope}assets/app.js`), true);
  assert.equal(f.contents.has(`${f.scope}assets/app.css`), true);
  f.goOffline();
  assert.match(await (await f.request(f.scope)).text(), /app.js/);
  assert.equal(await (await f.request(`${f.scope}assets/app.js`, 'cors')).text(), 'asset');
});

test('sync, non-GET and other product requests never enter the cache handler', async () => {
  const f = fixture();
  assert.equal(await f.request(`${f.scope}api/state`, 'cors'), undefined);
  assert.equal(await f.request(`${f.scope}api/state`, 'cors', 'PUT'), undefined);
  assert.equal(await f.request('https://demo.example/another-product/'), undefined);
});

test('activation deletes only older caches for this exact product scope', async () => {
  const f = fixture();
  await f.lifecycle('activate');
  assert.deepEqual(f.deleted, [`cosmic-shell-v0.1.0:${f.scope}`]);
});

test('a full cache cannot break a successfully fetched new bundle', async () => {
  const f = fixture({ failCacheWrite: true });
  const response = await f.request(`${f.scope}assets/new-build.js`, 'cors');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'online');
});
