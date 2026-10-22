import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Si esta ruta intenta acceder a Firebase, la prueba debe fallar sin tocar la nube.
vi.mock('../src/config/firebase.js', () => ({
  getDb: vi.fn(() => { throw new Error('Firebase no permitido en reading-test'); }),
  getAuth: vi.fn(() => { throw new Error('Firebase Auth no permitido en reading-test'); }),
  getFirebaseStatus: vi.fn(() => { throw new Error('Firebase status no permitido en reading-test'); }),
}));

import { createApp } from '../src/app.js';
import { env, type Env } from '../src/config/env.js';
import { getAuth, getDb, getFirebaseStatus } from '../src/config/firebase.js';

const endpoint = '/api/v1/dev/reading-test';
const fictitiousReading = {
  deviceId: 'pulsolink-prueba',
  sessionId: 'sesion-prueba',
  bootId: '550e8400-e29b-41d4-a716-446655440000',
  sequence: 1,
  capturedAt: null as string | null,
  measurements: {
    heartRate: { value: 78 as number | null, unit: 'bpm', status: 'valid' },
    spo2: { value: 96 as number | null, unit: '%', status: 'valid' },
    skinTemperature: { value: 27.1 as number | null, unit: 'C', status: 'valid' },
  },
};

// env se carga una vez al importar. Cambiarlo solo durante createApp prueba el
// montaje real por entorno, sin introducir un interruptor público de la ruta.
function appFor(mode: Env['NODE_ENV']) {
  const previous = env.NODE_ENV;
  env.NODE_ENV = mode;
  try { return createApp(); } finally { env.NODE_ENV = previous; }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  // Cubre todos los POST, incluidos válidos/errores: sin consulta ni escritura.
  expect(getDb).not.toHaveBeenCalled();
  expect(getAuth).not.toHaveBeenCalled();
  expect(getFirebaseStatus).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('POST dev/reading-test: diagnóstico aislado', () => {
  it('acepta MeasurementInput completo sin autenticar ni buscar deviceId/sessionId', async () => {
    const before = Date.now();
    const response = await request(appFor('development')).post(endpoint).send(fictitiousReading);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: {
      received: true, deviceId: 'pulsolink-prueba', receivedAt: expect.any(String), persisted: false,
    } });
    const receivedAt = Date.parse(response.body.data.receivedAt);
    expect(receivedAt).toBeGreaterThanOrEqual(before);
    expect(receivedAt).toBeLessThanOrEqual(Date.now());
    expect(response.body.data.receivedAt).toMatch(/Z$/);
    expect(console.info).toHaveBeenCalledOnce();
    const logArgs = vi.mocked(console.info).mock.calls[0];
    expect(logArgs).toHaveLength(1);
    const line = logArgs[0] as string;
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual(fictitiousReading);
    expect(line).toBe(JSON.stringify(fictitiousReading));
  });

  it('acepta fecha UTC y muestra independiente sin contacto óptico', async () => {
    const reading = structuredClone(fictitiousReading);
    reading.capturedAt = '2026-10-18T18:00:00.000Z';
    reading.measurements.heartRate = { value: null, unit: 'bpm', status: 'no_contact' };
    const response = await request(appFor('development')).post(endpoint).send(reading);
    expect(response.status).toBe(200);
    expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0] as string)).toEqual(reading);
  });

  it.each(['no_contact', 'invalid', 'unavailable'])('acepta null para calidad %s', async (status) => {
    const reading = structuredClone(fictitiousReading);
    reading.measurements.spo2 = { value: null, unit: '%', status };
    expect((await request(appFor('development')).post(endpoint).send(reading)).status).toBe(200);
  });

  const invalidCases: [string, (reading: typeof fictitiousReading) => void][] = [
    ['unidad incorrecta', r => { r.measurements.heartRate.unit = '%'; }],
    ['calidad desconocida', r => { r.measurements.spo2.status = 'stale'; }],
    ['no_contact con número', r => { r.measurements.heartRate.status = 'no_contact'; }],
    ['invalid con número', r => { r.measurements.spo2.status = 'invalid'; }],
    ['unavailable con número', r => { r.measurements.spo2.status = 'unavailable'; }],
    ['valid con null', r => { r.measurements.heartRate.value = null; }],
    ['pulso cero', r => { r.measurements.heartRate.value = 0; }],
    ['SpO2 mayor que 100', r => { r.measurements.spo2.value = 101; }],
    ['temperatura mayor que 125', r => { r.measurements.skinTemperature.value = 126; }],
    ['fecha ilegible', r => { r.capturedAt = 'ayer'; }],
    ['fecha sin zona', r => { r.capturedAt = '2026-10-18T18:00:00'; }],
    ['fecha con offset no UTC', r => { r.capturedAt = '2026-10-18T12:00:00-06:00'; }],
    ['deviceId vacío', r => { r.deviceId = ''; }],
    ['deviceId demasiado largo', r => { r.deviceId = 'x'.repeat(129); }],
    ['deviceId con /', r => { r.deviceId = 'placa/otra'; }],
    ['sessionId vacío', r => { r.sessionId = ''; }],
    ['sessionId demasiado largo', r => { r.sessionId = 'x'.repeat(129); }],
    ['sessionId con /', r => { r.sessionId = 'sesion/otra'; }],
    ['bootId inválido', r => { r.bootId = 'arranque'; }],
    ['sequence negativa', r => { r.sequence = -1; }],
    ['sequence fraccionaria', r => { r.sequence = 1.5; }],
    ['sequence fuera de uint32', r => { r.sequence = 4294967296; }],
    ['pulso mayor que 300', r => { r.measurements.heartRate.value = 301; }],
    ['SpO2 negativa', r => { r.measurements.spo2.value = -1; }],
    ['temperatura menor que -55', r => { r.measurements.skinTemperature.value = -56; }],
  ];
  it.each(invalidCases)('rechaza %s con 400 claro y sin log de lectura', async (_label, mutate) => {
    const reading = structuredClone(fictitiousReading);
    mutate(reading);
    const response = await request(appFor('development')).post(endpoint).send(reading);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: expect.any(String) });
    expect(response.body.error.details.length).toBeGreaterThan(0);
    expect(console.info).not.toHaveBeenCalled();
  });

  it.each(['deviceId', 'sessionId', 'bootId', 'sequence', 'capturedAt', 'measurements'])('exige el campo %s', async (field) => {
    const reading: Record<string, unknown> = structuredClone(fictitiousReading);
    delete reading[field];
    const response = await request(appFor('development')).post(endpoint).send(reading);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each(['heartRate', 'spo2', 'skinTemperature'])('exige measurements.%s', async (field) => {
    const reading = structuredClone(fictitiousReading);
    delete (reading.measurements as Record<string, unknown>)[field];
    expect((await request(appFor('development')).post(endpoint).send(reading)).status).toBe(400);
    expect(console.info).not.toHaveBeenCalled();
  });

  it.each(['value', 'unit', 'status'])('exige %s en cada magnitud', async (field) => {
    for (const name of ['heartRate', 'spo2', 'skinTemperature'] as const) {
      const reading = structuredClone(fictitiousReading);
      delete (reading.measurements[name] as Record<string, unknown>)[field];
      expect((await request(appFor('development')).post(endpoint).send(reading)).status).toBe(400);
    }
    expect(console.info).not.toHaveBeenCalled();
  });

  it.each([
    ['deviceId', 123], ['sessionId', null], ['bootId', 123], ['sequence', '1'],
    ['capturedAt', 123], ['measurements', []],
  ])('rechaza tipo inválido de %s', async (field, value) => {
    const response = await request(appFor('development')).post(endpoint)
      .send({ ...fictitiousReading, [field as string]: value });
    expect(response.status).toBe(400);
    expect(console.info).not.toHaveBeenCalled();
  });

  it('respeta IDs opacos del OpenAPI y escapa saltos de línea en una sola línea JSON', async () => {
    const reading = { ...fictitiousReading, deviceId: 'placa con espacio\ny acento á', sessionId: 'sesión de prueba' };
    const response = await request(appFor('development')).post(endpoint).send(reading);
    expect(response.status).toBe(200);
    const line = vi.mocked(console.info).mock.calls[0][0] as string;
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual(reading);
  });

  it.each([0, 4294967295])('acepta el límite sequence=%s y límites técnicos inclusivos', async (sequence) => {
    const reading = structuredClone(fictitiousReading);
    reading.sequence = sequence;
    reading.measurements.heartRate.value = 300;
    reading.measurements.spo2.value = sequence === 0 ? 0 : 100;
    reading.measurements.skinTemperature.value = sequence === 0 ? -55 : 125;
    expect((await request(appFor('development')).post(endpoint).send(reading)).status).toBe(200);
    expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0] as string)).toEqual(reading);
  });

  it('procesa cada envío nuevo al llegar, sin deduplicación, temporizador ni cola', async () => {
    const app = appFor('development');
    for (const sequence of [1, 2, 2]) {
      const response = await request(app).post(endpoint).send({ ...fictitiousReading, sequence });
      expect(response.status).toBe(200);
      expect(response.body.data.persisted).toBe(false);
    }
    expect(vi.mocked(console.info).mock.calls.map(args => JSON.parse(args[0] as string).sequence)).toEqual([1, 2, 2]);
  });

  it('rechaza JSON malformado sin registrar el cuerpo', async () => {
    const response = await request(appFor('development')).post(endpoint)
      .set('Content-Type', 'application/json').send('{"deviceId":');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('El cuerpo de la petición no es JSON válido.');
    expect(console.info).not.toHaveBeenCalled();
  });

  it('no registra Authorization, cookies ni otros encabezados', async () => {
    const response = await request(appFor('development')).post(endpoint)
      .set('Authorization', 'Bearer test-header-must-not-be-logged')
      .set('Cookie', 'test-cookie=must-not-be-logged')
      .send(fictitiousReading);
    expect(response.status).toBe(200);
    const logs = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logs).not.toContain('must-not-be-logged');
    expect(logs).not.toContain('Authorization');
  });

  it('rechaza campos ajenos, incluidas contraseñas/tokens, sin imprimirlos', async () => {
    const response = await request(appFor('development')).post(endpoint)
      .send({ ...fictitiousReading, password: 'must-not-be-logged', token: 'must-not-be-logged' });
    expect(response.status).toBe(400);
    expect(console.info).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain('must-not-be-logged');
  });

  it('mantiene el límite de cuerpo de 8 KiB', async () => {
    const response = await request(appFor('development')).post(endpoint)
      .send({ ...fictitiousReading, padding: 'x'.repeat(8192) });
    expect(response.status).toBe(413);
    expect(console.info).not.toHaveBeenCalled();
  });

  it.each(['production', 'test'] as const)('no monta la ruta en %s', async (mode) => {
    const response = await request(appFor(mode)).post(endpoint).send(fictitiousReading);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(console.info).not.toHaveBeenCalled();
  });

  it('no cambia la exigencia de credencial de la ingestión oficial', async () => {
    const response = await request(appFor('development')).post('/api/v1/device/measurements').send(fictitiousReading);
    expect(response.status).toBe(401);
    expect(console.info).not.toHaveBeenCalled();
  });
});
