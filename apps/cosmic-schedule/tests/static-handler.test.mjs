import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHandler, loadAssets } from '../server/static-handler.mjs';
import { createAccessControl } from '../server/access-control.mjs';

const authenticate = createAccessControl({ username: 'writer@example.com', password: 'example-password', viewerUsername: 'viewer@example.com', viewerPassword: 'example-viewer-password' });
const writer = `Basic ${Buffer.from('writer@example.com:example-password').toString('base64')}`;
const viewer = `Basic ${Buffer.from('viewer@example.com:example-viewer-password').toString('base64')}`;

function withAssets(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hidearyui-assets-'));
  try {
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><title>宇宙课程表</title><script src="/assets/app.js"></script><link href="/assets/app.css" rel="stylesheet"><link href="/manifest.webmanifest" rel="manifest">');
    fs.writeFileSync(path.join(directory, 'assets', 'app.js'), 'console.log("example");');
    fs.writeFileSync(path.join(directory, 'assets', 'app.css'), 'body { color: #123; }');
    fs.writeFileSync(path.join(directory, 'manifest.webmanifest'), JSON.stringify({ start_url: '/', scope: '/' }));
    fs.writeFileSync(path.join(directory, '.env'), 'EXAMPLE_SECRET=not-for-serving');
    fs.writeFileSync(path.join(directory, 'package.json'), '{"private":true}');
    fs.symlinkSync(path.join(directory, 'assets', 'app.js'), path.join(directory, 'linked.js'));
    run(loadAssets(directory));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function request(handler, url, method = 'GET', authorization = writer) {
  const result = { statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = body; },
  };
  handler({ url, method, headers: authorization ? { authorization } : {} }, result);
  return result;
}

test('authenticated root serves complete HTML and every referenced script/style exists', () => {
  withAssets((files) => {
    const handler = createHandler(files, { authenticate });
    const root = request(handler, '/');
    assert.equal(root.statusCode, 200);
    assert.match(root.body.toString(), /宇宙课程表/);
    for (const [, ref] of root.body.toString().matchAll(/(?:src|href)="([^"#]+)"/g)) assert.equal(request(handler, ref).statusCode, 200, ref);
    assert.match(root.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(root.headers['cache-control'], 'no-store');
    assert.equal(request(handler, '/', 'GET', viewer).statusCode, 200);
  });
});

test('authenticated HEAD returns no body and unsupported writes are rejected', () => {
  withAssets((files) => {
    const handler = createHandler(files, { authenticate });
    assert.equal(request(handler, '/', 'HEAD').body, undefined);
    assert.equal(request(handler, '/', 'POST').statusCode, 405);
  });
});

test('anonymous requests and handlers without authentication cannot expose HTML or assets', () => {
  withAssets((files) => {
    const handler = createHandler(files, { authenticate });
    for (const url of ['/', '/assets/app.js', '/manifest.webmanifest', '/healthz']) {
      const anonymous = request(handler, url, 'GET', null);
      assert.equal(anonymous.statusCode, 401);
      assert.match(anonymous.headers['www-authenticate'], /^Basic /);
      assert.doesNotMatch(anonymous.body?.toString() ?? '', /宇宙课程表|console\.log/);
    }
    assert.equal(request(createHandler(files), '/', 'GET', writer).statusCode, 401);
  });
});

test('source, dotfiles, symlinks, traversal and malformed paths cannot expose files', () => {
  withAssets((files) => {
    const handler = createHandler(files, { authenticate });
    for (const url of ['/.env', '/package.json', '/app/page.tsx', '/linked.js', '/%2e%2e/package.json', '/art/../../server/serve.mjs', '/%2e%2e%2fpackage.json']) assert.equal(request(handler, url).statusCode, 404, url);
    assert.equal(request(handler, '/%ZZ').statusCode, 400);
  });
});

test('manifest starts at the independent domain root', () => {
  withAssets((files) => {
    const manifest = JSON.parse(request(createHandler(files, { authenticate }), '/manifest.webmanifest').body);
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
  });
});
