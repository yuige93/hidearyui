import { createHash, timingSafeEqual } from 'node:crypto';

function validateAccount(username, password, label) {
  if (typeof username !== 'string' || !username.trim() || /[:\r\n]/.test(username))
    throw new Error(`${label}_USERNAME must be a non-empty username without colons or newlines`);
  if (typeof password !== 'string' || !password.length || /[\r\n]/.test(password))
    throw new Error(`${label}_PASSWORD must be a non-empty password without newlines`);
}

export function loadAccessConfig(env = process.env) {
  const config = {
    username: env.PLANNER_USERNAME,
    password: env.PLANNER_PASSWORD,
    viewerUsername: env.PLANNER_VIEWER_USERNAME,
    viewerPassword: env.PLANNER_VIEWER_PASSWORD,
  };
  validateAccount(config.username, config.password, 'PLANNER');
  if ((config.viewerUsername === undefined || config.viewerUsername === '') &&
      (config.viewerPassword === undefined || config.viewerPassword === '')) {
    config.viewerUsername = undefined;
    config.viewerPassword = undefined;
  }
  if (config.viewerUsername !== undefined || config.viewerPassword !== undefined) {
    validateAccount(config.viewerUsername, config.viewerPassword, 'PLANNER_VIEWER');
    if (config.viewerUsername === config.username)
      throw new Error('Writer and viewer usernames must be different');
  }
  return config;
}

function digest(username, password) {
  return createHash('sha256').update(username).update('\0').update(password).digest();
}

function basicCredentials(req) {
  const header = req.headers?.authorization;
  if (typeof header !== 'string' || header.length > 8192) return null;
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if (!match) return null;
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.toString('base64') !== match[1]) return null;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return null;
  const colon = text.indexOf(':');
  if (colon < 1) return null;
  return { username: text.slice(0, colon), password: text.slice(colon + 1) };
}

export function createAccessControl(config) {
  validateAccount(config?.username, config?.password, 'PLANNER');
  const hasViewer = config.viewerUsername !== undefined || config.viewerPassword !== undefined;
  if (hasViewer) {
    validateAccount(config.viewerUsername, config.viewerPassword, 'PLANNER_VIEWER');
    if (config.viewerUsername === config.username)
      throw new Error('Writer and viewer usernames must be different');
  }
  const writer = digest(config.username, config.password);
  const viewer = hasViewer ? digest(config.viewerUsername, config.viewerPassword) : writer;
  return function authenticate(req) {
    const credentials = basicCredentials(req);
    if (!credentials) return null;
    const supplied = digest(credentials.username, credentials.password);
    // Compare fixed-length hashes for both roles before choosing a result.
    const writerMatches = timingSafeEqual(supplied, writer);
    const viewerMatches = timingSafeEqual(supplied, viewer);
    if (writerMatches) return { readOnly: false };
    if (hasViewer && viewerMatches) return { readOnly: true };
    return null;
  };
}

export function trustedAccess(req, authenticate) {
  try {
    const access = typeof authenticate === 'function' ? authenticate(req) : null;
    return access && typeof access.readOnly === 'boolean' ? access : null;
  } catch {
    return null;
  }
}

export function sendAuthRequired(res, { json = false } = {}) {
  const body = json ? JSON.stringify({ error: 'authentication_required' }) : 'Authentication required';
  res.statusCode = 401;
  res.setHeader('WWW-Authenticate', 'Basic realm="Cosmic Schedule", charset="UTF-8"');
  res.setHeader('Content-Type', json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(body);
}
