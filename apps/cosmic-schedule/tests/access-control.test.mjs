import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessControl, loadAccessConfig, sendAuthRequired, trustedAccess } from '../server/access-control.mjs';

const credentials = {
  username: 'writer@example.com',
  password: 'example-writer-password',
  viewerUsername: 'viewer@example.com',
  viewerPassword: 'example-viewer-password',
};

function authorization(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

test('only configured Basic credentials receive writer or viewer access', () => {
  const authenticate = createAccessControl(credentials);
  assert.deepEqual(authenticate({ headers: { authorization: authorization(credentials.username, credentials.password) } }), { readOnly: false });
  assert.deepEqual(authenticate({ headers: { authorization: authorization(credentials.viewerUsername, credentials.viewerPassword) } }), { readOnly: true });
  assert.equal(authenticate({ headers: { authorization: authorization(credentials.username, 'wrong-password') } }), null);
  assert.equal(authenticate({ headers: { authorization: authorization('unknown@example.com', credentials.password) } }), null);
});

test('missing, malformed and forged proxy credentials cannot authenticate a request', () => {
  const authenticate = createAccessControl(credentials);
  for (const headers of [
    {},
    { authorization: '' },
    { authorization: 'Bearer example-token' },
    { authorization: 'Basic !!!' },
    { authorization: `Basic ${Buffer.from('no-password-separator').toString('base64')}` },
    { authorization: [authorization(credentials.username, credentials.password)] },
    { 'cf-access-jwt-assertion': 'header.eyJlbWFpbCI6IndyaXRlckBleGFtcGxlLmNvbSJ9.signature' },
    { 'cf-access-authenticated-user-email': credentials.username },
  ]) {
    assert.equal(authenticate({ headers }), null);
  }
});

test('a password can contain a colon without changing the authenticated username', () => {
  const authenticate = createAccessControl({ username: 'writer@example.com', password: 'example:password' });
  assert.deepEqual(authenticate({ headers: { authorization: authorization('writer@example.com', 'example:password') } }), { readOnly: false });
});

test('authentication configuration requires writer credentials and a complete optional viewer pair', () => {
  assert.throws(() => loadAccessConfig({}));
  assert.throws(() => loadAccessConfig({ PLANNER_USERNAME: credentials.username }));
  assert.throws(() => loadAccessConfig({ PLANNER_PASSWORD: credentials.password }));
  const writer = { PLANNER_USERNAME: credentials.username, PLANNER_PASSWORD: credentials.password };
  assert.throws(() => loadAccessConfig({ ...writer, PLANNER_VIEWER_USERNAME: credentials.viewerUsername }));
  assert.throws(() => loadAccessConfig({ ...writer, PLANNER_VIEWER_PASSWORD: credentials.viewerPassword }));
  assert.throws(() => loadAccessConfig({ ...writer, PLANNER_VIEWER_USERNAME: credentials.username, PLANNER_VIEWER_PASSWORD: credentials.viewerPassword }));
  assert.throws(() => createAccessControl({}));
  assert.throws(() => createAccessControl({ ...credentials, viewerUsername: credentials.username }));
});

test('environment configuration maps to the same explicit roles', () => {
  const config = loadAccessConfig({
    PLANNER_USERNAME: credentials.username,
    PLANNER_PASSWORD: credentials.password,
    PLANNER_VIEWER_USERNAME: credentials.viewerUsername,
    PLANNER_VIEWER_PASSWORD: credentials.viewerPassword,
  });
  const authenticate = createAccessControl(config);
  assert.deepEqual(authenticate({ headers: { authorization: authorization(credentials.username, credentials.password) } }), { readOnly: false });
  assert.deepEqual(authenticate({ headers: { authorization: authorization(credentials.viewerUsername, credentials.viewerPassword) } }), { readOnly: true });
});

test('empty optional viewer environment variables leave a writer-only instance', () => {
  const config = loadAccessConfig({
    PLANNER_USERNAME: credentials.username,
    PLANNER_PASSWORD: credentials.password,
    PLANNER_VIEWER_USERNAME: '',
    PLANNER_VIEWER_PASSWORD: '',
  });
  assert.equal(config.viewerUsername, undefined);
  assert.equal(config.viewerPassword, undefined);
  const authenticate = createAccessControl(config);
  assert.deepEqual(authenticate({ headers: { authorization: authorization(credentials.username, credentials.password) } }), { readOnly: false });
  assert.equal(authenticate({ headers: { authorization: authorization(credentials.viewerUsername, credentials.viewerPassword) } }), null);
  assert.throws(() => loadAccessConfig({
    PLANNER_USERNAME: credentials.username,
    PLANNER_PASSWORD: credentials.password,
    PLANNER_VIEWER_USERNAME: credentials.viewerUsername,
    PLANNER_VIEWER_PASSWORD: '',
  }));
});

test('an authentication challenge contains no credentials and can return a JSON error', () => {
  const response = { statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = body; },
  };
  sendAuthRequired(response, { json: true });
  assert.equal(response.statusCode, 401);
  assert.match(response.headers['www-authenticate'], /^Basic /);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(response.body.toString()), { error: 'authentication_required' });
  assert.doesNotMatch(response.body.toString(), /example-writer-password|example-viewer-password/);
});

test('missing, throwing or malformed authentication callbacks fail closed', () => {
  const req = { headers: {} };
  for (const callback of [undefined, () => null, () => ({}), () => ({ readOnly: 'false' }), () => { throw new Error('unavailable'); }]) {
    assert.equal(trustedAccess(req, callback), null);
  }
  assert.deepEqual(trustedAccess(req, () => ({ readOnly: false })), { readOnly: false });
  assert.deepEqual(trustedAccess(req, () => ({ readOnly: true })), { readOnly: true });
});
