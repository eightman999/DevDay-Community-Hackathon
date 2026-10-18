import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeEnemyTurn } from './dist/enemy-policy.mjs';
import {createDecisionService} from './server/decision-service.mjs';
import {createCompanionService} from './server/companion-service.mjs';

const ROOT = resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const BODY_LIMIT = 32768;
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
}

async function readBody(stream, limit = BODY_LIMIT) {
  let size = 0;
  const chunks = [];
  // Keep an oversized incoming HTTP request writable long enough to send 413.
  const readable = typeof stream.iterator === 'function' ? stream.iterator({ destroyOnReturn: false }) : stream;
  for await (const chunk of readable) {
    size += chunk.length;
    if (size > limit) throw new Error('body-limit');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function allowedHost(request, port) {
  const host = request.headers.host;
  return [`127.0.0.1:${port}`, `localhost:${port}`].includes(host);
}

function sameOrigin(request) {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  return !request.headers.origin || request.headers.origin === `http://${request.headers.host}`;
}

/** Loopback-only development server; the Worker uses the same decision service. */
export function createCellwatchServer(options = {}) {
  const {decide, status} = createDecisionService(options);
  const companion = createCompanionService({apiKey:options.apiKey,enabled:options.companionEnabled ?? false,...options.companionOptions});
  const server = createServer(async (request, response) => {
    try {
      if (!allowedHost(request, server.address()?.port)) return json(response, 403, { error: 'origin' });
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/') && !sameOrigin(request)) return json(response, 403, { error: 'origin' });
      if (url.pathname === '/api/enemy/status' && request.method === 'GET') return json(response, 200, status);
      if (url.pathname === '/api/companion/status' && request.method === 'GET') return json(response, 200, companion.status);
      if (url.pathname === '/api/companion/message' && request.method === 'POST') {
        if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) return json(response, 415, {error:'content-type'});
        try {
          const payload=JSON.parse(await readBody(request));
          if(typeof payload?.sessionId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(payload.sessionId))return json(response,400,{error:'invalid-request'});
          return json(response,200,await companion.message(payload.sessionId,payload));
        } catch(error) {request.resume();return json(response,error.message==='body-limit'?413:400,{error:error.message==='body-limit'?'body-limit':'invalid-request'});}
      }
      if (url.pathname === '/api/enemy/decide' && request.method === 'POST') {
        if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) return json(response, 415, { error: 'content-type' });
        if (Number(request.headers['content-length']) > BODY_LIMIT) return json(response, 413, { error: 'body-limit' });
        let payload;
        try { payload = JSON.parse(await readBody(request)); }
        catch (error) {
          request.resume();
          return json(response, error?.message === 'body-limit' ? 413 : 400, { error: error?.message === 'body-limit' ? 'body-limit' : 'invalid-request' });
        }
        if (!payload || typeof payload.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(payload.sessionId)) return json(response, 400, { error: 'invalid-request' });
        let turn;
        try { turn = normalizeEnemyTurn(payload.turn); }
        catch { return json(response, 400, { error: 'invalid-request' }); }
        return json(response, 200, await decide(payload.sessionId, turn));
      }
      if (url.pathname.startsWith('/api/')) return json(response, 404, { error: 'not-found' });
      if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { error: 'method' });
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return json(response, 400, { error: 'path' }); }
      if (pathname.split(/[\\/]/).some(part => part.startsWith('.')) || pathname.includes('\\') || pathname.includes('\0')) return json(response, 404, { error: 'not-found' });
      const file = resolve(ROOT, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(ROOT + sep) || !MIME[extname(file)]) return json(response, 404, { error: 'not-found' });
      let content;
      try {
        const actual = await realpath(file);
        if (!actual.startsWith(ROOT + sep)) return json(response, 404, { error: 'not-found' });
        content = await readFile(actual);
      } catch { return json(response, 404, { error: 'not-found' }); }
      response.writeHead(200, { 'Content-Type': MIME[extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { if (!response.headersSent) json(response, 500, { error: 'server-error' }); else response.end(); }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.CELLWATCH_PORT || process.env.PORT || 8766);
  const mode = process.env.CELLWATCH_ENEMY_MODE;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || (mode && !['auto', 'local', 'decisions'].includes(mode))) {
    console.error('CELLWATCH_PORT / PORT または CELLWATCH_ENEMY_MODE の設定が不正です。');
    process.exitCode = 1;
  } else {
    const server = createCellwatchServer({ apiKey: process.env.OPENAI_API_KEY || '', mode: mode || undefined,companionEnabled:process.env.COMPANION_AI_ENABLED==='true' });
    server.on('error', () => { console.error('CELLWATCH サーバーを起動できませんでした。ポートを確認してください。'); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`CELLWATCH http://127.0.0.1:${port} (適応型の敵: ${mode === 'local' || !process.env.OPENAI_API_KEY ? 'local' : 'decisions'})`));
  }
}
