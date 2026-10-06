import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAccessControl, loadAccessConfig } from './access-control.mjs';
import { createHandler, loadAssets } from './static-handler.mjs';
import { createStateApi } from './state-api.mjs';
import { createStateStore } from './state-store.mjs';

// Validate credentials before reading assets, creating data files or listening.
const authenticate = createAccessControl(loadAccessConfig());
const port = Number(process.env.PORT || 3004);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const assets = loadAssets(fileURLToPath(new URL('../dist/', import.meta.url)));
const staticHandler = createHandler(assets, { authenticate });
const dataRoot = process.env.PLANNER_DATA_DIR
  ? path.resolve(process.env.PLANNER_DATA_DIR)
  : fileURLToPath(new URL('../data/', import.meta.url));
const stateStore = createStateStore(dataRoot);
const stateApi = createStateApi(stateStore, { authenticate });
const server = http.createServer({ maxHeaderSize: 32768 }, (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }
  if (pathname === '/api/state') void stateApi(req, res);
  else staticHandler(req, res);
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () => console.log(`Cosmic Schedule ready on 127.0.0.1:${port}`));
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
