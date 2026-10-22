import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/firebase.js', () => ({
  getDb: vi.fn(() => { throw new Error('No cloud access in hosting tests'); }),
  getAuth: vi.fn(() => { throw new Error('No Auth access in hosting tests'); }),
  getFirebaseStatus: () => ({ configured: false, mode: 'uninitialized' }),
}));

import { createApp } from '../src/app.js';
import { createWebRouter } from '../src/web.js';

const temporaryRoot = resolve(tmpdir());
const directory = mkdtempSync(join(temporaryRoot, 'pulsolink-web-'));
mkdirSync(join(directory, 'assets'));
const html = '<!doctype html><html><body><div id="root">PulsoLink fixture</div></body></html>';
writeFileSync(join(directory, 'index.html'), html);
writeFileSync(join(directory, 'assets', 'app-abc123.js'), 'console.log("fixture")');
writeFileSync(join(directory, '.env'), 'PRIVATE_SENTINEL');
// Even an accidentally generated file under /api must not shadow the API.
mkdirSync(join(directory, 'api'));
writeFileSync(join(directory, 'api', 'shadow.html'), 'SHADOW_SENTINEL');
const app = createApp({ webDistPath: directory });
afterAll(() => {
  if (dirname(resolve(directory)) !== temporaryRoot || !basename(directory).startsWith('pulsolink-web-')) {
    throw new Error('Unexpected temporary directory; refusing recursive cleanup');
  }
  rmSync(directory, { recursive: true, force: true });
});

describe('web and API under one origin', () => {
  it.each(['/', '/login', '/monitoring/patient.with.dots', '/admin/users'])('serves SPA navigation %s', async path => {
    const response = await request(app).get(path).accept('html');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.text).toBe(html);
  });

  it('serves HEAD and immutable compiled assets', async () => {
    expect((await request(app).head('/login').accept('html')).status).toBe(200);
    const response = await request(app).get('/assets/app-abc123.js');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('immutable');
    expect(response.text).toContain('console.log');
  });

  it.each(['/api', '/api/v1/missing', '/API/v1/missing', '/api/shadow.html', '/assets/missing.js', '/.env'])('does not replace %s with HTML', async path => {
    const response = await request(app).get(path).accept('html');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.text).not.toContain('PRIVATE_SENTINEL');
    expect(response.text).not.toContain('SHADOW_SENTINEL');
  });

  it('preserves public health and authenticated API responses', async () => {
    expect((await request(app).get('/api/v1/health')).body.status).toBe('ok');
    for (const path of ['/api/v1/patients', '/api/v1/device/config']) {
      const response = await request(app).get(path).accept('html');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('does not serve the SPA for JSON-only requests or POST', async () => {
    expect((await request(app).get('/login').accept('json')).status).toBe(404);
    expect((await request(app).post('/login')).status).toBe(404);
  });

  it('requires a build and leaves the API-only factory available', async () => {
    expect(() => createWebRouter(join(directory, 'missing'))).toThrow('WEB_BUILD_MISSING');
    expect((await request(createApp()).get('/login').accept('html')).status).toBe(404);
  });
});
