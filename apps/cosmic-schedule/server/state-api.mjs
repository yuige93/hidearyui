import { MAX_STATE_BYTES } from './state-store.mjs';
import { sendAuthRequired, trustedAccess } from './access-control.mjs';

function sendJson(res, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', body.length);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

async function readJson(req) {
  const declaredLength = Number(req.headers['content-length'] ?? 0);
  if (declaredLength > MAX_STATE_BYTES) throw new Error('too_large');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_STATE_BYTES) throw new Error('too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createStateApi(store, { authenticate } = {}) {
  return async (req, res) => {
    const access = trustedAccess(req, authenticate);
    if (!access) {
      sendAuthRequired(res, { json: true });
      return;
    }
    // This deployment serves UI and API from the same origin. It deliberately
    // grants no cross-origin browser access to the private family state.
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method === 'GET') {
      sendJson(res, 200, { ...store.get(), readOnly: access.readOnly, syncProtocol: 2 });
      return;
    }
    if (req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, PUT, OPTIONS');
      sendJson(res, 405, { error: 'method_not_allowed' });
      return;
    }
    if (access.readOnly) {
      sendJson(res, 403, { error: 'read_only' });
      return;
    }
    try {
      const body = await readJson(req);
      // Old clients union whole snapshots on conflict and can resurrect deleted
      // items. Do not let those clients write after the protocol upgrade.
      if (body.syncProtocol !== 2) {
        sendJson(res, 426, { error: 'update_required', syncProtocol: 2 });
        return;
      }
      let result;
      try {
        result = store.put(body.revision, body.state);
      } catch (error) {
        console.error('Planner storage write failed:', error?.code ?? 'write_failed');
        sendJson(res, 500, { error: 'storage_error' });
        return;
      }
      if (result.status === 'saved')
        sendJson(res, 200, { ...result, syncProtocol: 2 });
      else if (result.status === 'conflict')
        sendJson(res, 409, { ...result, syncProtocol: 2 });
      else if (result.status === 'too_large')
        sendJson(res, 413, { error: result.status });
      else sendJson(res, 400, { error: result.status });
    } catch (error) {
      sendJson(res, error?.message === 'too_large' ? 413 : 400, {
        error: error?.message === 'too_large' ? 'too_large' : 'invalid_json',
      });
    }
  };
}
