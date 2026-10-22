import express, { Express } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDeviceMeasurementsRouter } from '../src/modules/measurements/device-measurements.router.js';
import type { DeviceAuthVerifier } from '../src/modules/devices/device-auth.middleware.js';
import type { DeviceDocument } from '../src/modules/devices/devices.repository.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { PersistenceError } from '../src/shared/persistence.js';
import type { IngestInput } from '../src/modules/measurements/measurements.repository.js';

interface InMemoryDeviceData {
  device: DeviceDocument;
  credentialId: string;
  secret: string;
  credentialEnabled: boolean;
  revokedAt: string | null;
}

function createTestDevice(overrides: Partial<DeviceDocument> = {}): InMemoryDeviceData {
  const deviceId = overrides.deviceId ?? `dev-${randomUUID().slice(0, 8)}`;
  const credentialId = `cred-${randomUUID().slice(0, 8)}`;
  const secret = randomBytes(32).toString('base64url');
  return {
    device: {
      deviceId,
      code: `ESP-${deviceId}`,
      board: 'nodemcu-esp8266',
      source: 'simulated',
      enabled: true,
      activeSessionId: null,
      lastSeenAt: null,
      ...overrides,
    },
    credentialId,
    secret,
    credentialEnabled: true,
    revokedAt: null,
  };
}

function createTestApp(deps: {
  credentialsRepo: DeviceAuthVerifier;
  devicesRepo: {
    getById: (id: string) => Promise<DeviceDocument | null>;
    heartbeat: (id: string) => Promise<string>;
  };
  measurementsRepo: {
    ingest: (deviceId: string, input: IngestInput) => Promise<{
      measurementId: string;
      receivedAt: string;
      duplicate: boolean;
    }>;
  };
}): Express {
  const app = express();
  app.use(express.json({ limit: '8kb' }));

  const router = createDeviceMeasurementsRouter(deps);
  app.use('/api/v1/device', router);
  app.use(errorHandler);

  return app;
}

function validPayload(deviceId = 'dev-001', overrides: Partial<IngestInput> = {}): IngestInput {
  return {
    deviceId,
    sessionId: 'session-001',
    bootId: randomUUID(),
    sequence: 0,
    capturedAt: new Date().toISOString(),
    measurements: {
      heartRate: {
        value: 72,
        unit: 'bpm',
        status: 'valid',
      },
      spo2: {
        value: 98,
        unit: '%',
        status: 'valid',
      },
      skinTemperature: {
        value: 32.5,
        unit: 'C',
        status: 'valid',
      },
    },
    ...overrides,
  };
}

describe('Contrato A: Endpoints de Dispositivo IoT / Simulador (/api/v1/device)', () => {
  describe('Autenticación (Bearer <credentialId>.<secret>)', () => {
    it('devuelve 401 si no se envía la cabecera Authorization', async () => {
      const dev = createTestDevice();
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app).get('/api/v1/device/config');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.message).toMatch(/requerida/i);
    });

    it('devuelve 401 si la cabecera no tiene esquema Bearer', async () => {
      const dev = createTestDevice();
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app)
        .get('/api/v1/device/config')
        .set('Authorization', 'Basic user:pass');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('devuelve 401 si el token no es válido o está revocado', async () => {
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => null },
        devicesRepo: {
          getById: async () => null,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app)
        .get('/api/v1/device/config')
        .set('Authorization', 'Bearer cred-bad.secret_invalido_que_falla');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('GET /api/v1/device/config', () => {
    it('devuelve 200 con configuración e intervalos sin exponer secretos (sesión inactiva)', async () => {
      const dev = createTestDevice({ activeSessionId: null });
      const app = createTestApp({
        credentialsRepo: { authenticate: async (token) => (token === `${dev.credentialId}.${dev.secret}` ? dev.device : null) },
        devicesRepo: {
          getById: async (id) => (id === dev.device.deviceId ? dev.device : null),
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app)
        .get('/api/v1/device/config')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        deviceId: dev.device.deviceId,
        activeSessionId: null,
        uploadIntervalMs: 2000,
        heartbeatIntervalMs: 15000,
        serverTime: expect.any(String),
      });
      // Verificación estricta: ningún campo sensible expuesto
      expect(res.body.data).not.toHaveProperty('secret');
      expect(res.body.data).not.toHaveProperty('secretHash');
      expect(res.body.data).not.toHaveProperty('credentialId');
    });

    it('devuelve activeSessionId cuando el dispositivo tiene una sesión activa asignada', async () => {
      const dev = createTestDevice({ activeSessionId: 'sess-active-456' });
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app)
        .get('/api/v1/device/config')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`);

      expect(res.status).toBe(200);
      expect(res.body.data.activeSessionId).toBe('sess-active-456');
    });

    it('devuelve 401 si el dispositivo fue deshabilitado posteriormente en base de datos', async () => {
      const dev = createTestDevice({ enabled: false });
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => ({ ...dev.device, enabled: false }),
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app)
        .get('/api/v1/device/config')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('POST /api/v1/device/heartbeat', () => {
    it('devuelve 200 y actualiza lastSeenAt con payload válido', async () => {
      const dev = createTestDevice();
      const heartbeatSpy = vi.fn().mockResolvedValue('2026-10-17T03:00:00.000Z');
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: heartbeatSpy,
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const bootId = randomUUID();
      const res = await request(app)
        .post('/api/v1/device/heartbeat')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send({
          deviceId: dev.device.deviceId,
          bootId,
          uptimeMs: 12500,
          firmwareVersion: '1.0.0-nodemcu',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        serverTime: '2026-10-17T03:00:00.000Z',
      });
      expect(heartbeatSpy).toHaveBeenCalledWith(dev.device.deviceId);
      expect(res.body.data).not.toHaveProperty('secret');
    });

    it('devuelve 400 si bootId no es un UUID válido', async () => {
      const dev = createTestDevice();
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app)
        .post('/api/v1/device/heartbeat')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send({
          deviceId: dev.device.deviceId,
          bootId: 'not-a-valid-uuid',
          uptimeMs: 5000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('devuelve 400 si uptimeMs es negativo', async () => {
      const dev = createTestDevice();
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app)
        .post('/api/v1/device/heartbeat')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send({
          deviceId: dev.device.deviceId,
          bootId: randomUUID(),
          uptimeMs: -10,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('devuelve 400 si se envían campos desconocidos (schema strict)', async () => {
      const dev = createTestDevice();
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app)
        .post('/api/v1/device/heartbeat')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send({
          deviceId: dev.device.deviceId,
          bootId: randomUUID(),
          uptimeMs: 1000,
          injectedField: 'hack',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/device/measurements', () => {
    it('acepta capturedAt con offset y lo normaliza a UTC antes de persistir', async () => {
      const dev = createTestDevice();
      const ingest = vi.fn().mockResolvedValue({ measurementId: 'm-offset', receivedAt: '2026-10-21T10:00:01.000Z', duplicate: false });
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: { getById: async () => dev.device, heartbeat: async () => new Date().toISOString() },
        measurementsRepo: { ingest },
      });
      const response = await request(app).post('/api/v1/device/measurements')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send({ ...validPayload(dev.device.deviceId), capturedAt: '2026-10-21T12:00:00+02:00' });
      expect(response.status).toBe(201);
      expect(ingest).toHaveBeenCalledWith(dev.device.deviceId,
        expect.objectContaining({ capturedAt: '2026-10-21T10:00:00.000Z' }));
    });

    it('rechaza IDs de sesión . y .. por HTTP sin escribir mediciones', async () => {
      const dev = createTestDevice();
      const ingest = vi.fn();
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: { getById: async () => dev.device, heartbeat: async () => new Date().toISOString() },
        measurementsRepo: { ingest },
      });
      for (const sessionId of ['.', '..']) {
        const response = await request(app).post('/api/v1/device/measurements')
          .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
          .send({ ...validPayload(dev.device.deviceId), sessionId });
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(ingest).not.toHaveBeenCalled();
    });

    it('muestra válida se guarda y devuelve 201 (duplicate = false)', async () => {
      const dev = createTestDevice();
      const payload = validPayload(dev.device.deviceId);
      const ingestSpy = vi.fn().mockResolvedValue({
        measurementId: 'meas-12345',
        receivedAt: '2026-10-17T03:00:02.000Z',
        duplicate: false,
      });

      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: { ingest: ingestSpy },
      });

      const res = await request(app)
        .post('/api/v1/device/measurements')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        measurementId: 'meas-12345',
        receivedAt: '2026-10-17T03:00:02.000Z',
        duplicate: false,
      });
      expect(ingestSpy).toHaveBeenCalledWith(dev.device.deviceId, expect.objectContaining({
        sessionId: payload.sessionId,
        bootId: payload.bootId,
        sequence: payload.sequence,
      }));
    });

    it('repetición idéntica devuelve 200 sin duplicar (duplicate = true)', async () => {
      const dev = createTestDevice();
      const payload = validPayload(dev.device.deviceId);
      const ingestSpy = vi.fn().mockResolvedValue({
        measurementId: 'meas-12345',
        receivedAt: '2026-10-17T03:00:02.000Z',
        duplicate: true,
      });

      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: { ingest: ingestSpy },
      });

      const res = await request(app)
        .post('/api/v1/device/measurements')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        measurementId: 'meas-12345',
        receivedAt: '2026-10-17T03:00:02.000Z',
        duplicate: true,
      });
    });

    it('misma clave (deviceId+bootId+sequence) y contenido distinto devuelve 409 IDEMPOTENCY_CONFLICT', async () => {
      const dev = createTestDevice();
      const payload = validPayload(dev.device.deviceId);
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => {
            throw new PersistenceError('IDEMPOTENCY_CONFLICT', 'La clave ya tiene otro contenido.');
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/device/measurements')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(res.body.error.message).toMatch(/clave ya tiene otro contenido/i);
    });

    it('una muestra nueva para sesión finalizada o inactiva devuelve 409 SESSION_NOT_ACTIVE', async () => {
      const dev = createTestDevice();
      const payload = validPayload(dev.device.deviceId);
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => {
            throw new PersistenceError('SESSION_NOT_ACTIVE', 'La sesión no está activa para este dispositivo.');
          },
        },
      });

      const res = await request(app)
        .post('/api/v1/device/measurements')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SESSION_NOT_ACTIVE');
      expect(res.body.error.message).toMatch(/sesión no está activa/i);
    });

    it('repetir una muestra ya guardada conserva su respuesta idempotente 200 tras finalizar la sesión', async () => {
      const dev = createTestDevice();
      const payload = validPayload(dev.device.deviceId);
      // En el repositorio, si la clave existe con mismo hash, devuelve duplicate: true sin verificar si la sesión sigue activa.
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({
            measurementId: 'meas-original',
            receivedAt: '2026-10-17T03:00:00.000Z',
            duplicate: true,
          }),
        },
      });

      const res = await request(app)
        .post('/api/v1/device/measurements')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.duplicate).toBe(true);
      expect(res.body.data.measurementId).toBe('meas-original');
    });

    it('devuelve 400 si se envía un valor no válido para status: valid (ej. pulso null)', async () => {
      const dev = createTestDevice();
      const payload = validPayload(dev.device.deviceId);
      // @ts-expect-error probando valor inválido
      payload.measurements.heartRate.value = null; // Incompatible con status 'valid'

      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app)
        .post('/api/v1/device/measurements')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('devuelve 400 si status no_contact contiene un valor numérico (debe ser null)', async () => {
      const dev = createTestDevice();
      const payload = validPayload(dev.device.deviceId);
      payload.measurements.spo2 = {
        value: 95,
        unit: '%',
        status: 'no_contact',
      };

      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app)
        .post('/api/v1/device/measurements')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('admite lecturas con falta de contacto óptico cuando el valor es null', async () => {
      const dev = createTestDevice();
      const payload = validPayload(dev.device.deviceId);
      payload.measurements.heartRate = {
        value: null,
        unit: 'bpm',
        status: 'no_contact',
      };
      payload.measurements.spo2 = {
        value: null,
        unit: '%',
        status: 'no_contact',
      };

      const ingestSpy = vi.fn().mockResolvedValue({
        measurementId: 'meas-no-contact',
        receivedAt: new Date().toISOString(),
        duplicate: false,
      });

      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: { ingest: ingestSpy },
      });

      const res = await request(app)
        .post('/api/v1/device/measurements')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(ingestSpy).toHaveBeenCalled();
    });

    it('rechaza con 403 si el deviceId declarado difiere de la credencial', async () => {
      const dev = createTestDevice();
      const payload = {
        ...validPayload(dev.device.deviceId),
        deviceId: 'hacked-device-id',
      };

      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      const res = await request(app)
        .post('/api/v1/device/measurements')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DEVICE_ID_MISMATCH');
    });

    it('rechaza con 413 si la carga útil excede los 8 KiB del contrato', async () => {
      const dev = createTestDevice();
      const app = createTestApp({
        credentialsRepo: { authenticate: async () => dev.device },
        devicesRepo: {
          getById: async () => dev.device,
          heartbeat: async () => new Date().toISOString(),
        },
        measurementsRepo: {
          ingest: async () => ({ measurementId: 'm-1', receivedAt: new Date().toISOString(), duplicate: false }),
        },
      });

      // Crear un string de más de 8 KiB
      const largePadding = 'A'.repeat(9 * 1024);
      const res = await request(app)
        .post('/api/v1/device/measurements')
        .set('Authorization', `Bearer ${dev.credentialId}.${dev.secret}`)
        .send({ padding: largePadding });

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('Integración con createApp()', () => {
    const realApp = createApp();

    it('GET /api/v1/device/config responde 401 UNAUTHENTICATED sin credencial', async () => {
      const res = await request(realApp).get('/api/v1/device/config');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('POST /api/v1/device/heartbeat responde 401 UNAUTHENTICATED sin credencial', async () => {
      const res = await request(realApp)
        .post('/api/v1/device/heartbeat')
        .send({ bootId: randomUUID(), uptimeMs: 1000 });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('POST /api/v1/device/measurements responde 401 UNAUTHENTICATED sin credencial', async () => {
      const res = await request(realApp)
        .post('/api/v1/device/measurements')
        .send(validPayload());
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });
});
