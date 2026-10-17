import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /api/v1/health', () => {
  const app = createApp();

  it('debe responder 200 con status ok y metadatos de la API', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('service', 'pulsolink-api');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('firebase');
    expect(response.body.firebase).toHaveProperty('configured');
  });

  it('debe responder 404 en rutas inexistentes con formato estándar de error', async () => {
    const response = await request(app).get('/api/v1/ruta-no-existente');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
  });
});
