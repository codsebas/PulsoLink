import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../shared/response.js';

// Deliberadamente independiente de repositorios y Firebase. No es ingestión.
function testVital(unit: 'bpm' | '%' | 'C', min: number, max: number, exclusiveMin = false) {
  return z.object({
    value: z.number().finite().nullable(),
    unit: z.literal(unit),
    status: z.enum(['valid', 'no_contact', 'invalid', 'unavailable']),
  }).strict().superRefine((reading, ctx) => {
    if (reading.status !== 'valid') {
      if (reading.value !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'],
          message: 'value debe ser null cuando status no es valid.' });
      }
      return;
    }

    if (reading.value === null || (exclusiveMin ? reading.value <= min : reading.value < min) || reading.value > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'],
        message: `Un dato valid requiere un número ${exclusiveMin ? 'mayor que' : 'mayor o igual a'} ${min} y menor o igual a ${max} ${unit}.` });
    }
  });
}

export const readingTestSchema = z.object({
  // MeasurementInput de contracts/device.openapi.yaml: IDs opacos sin '/'.
  deviceId: z.string().min(1).max(128).regex(/^[^/]+$/, 'deviceId no debe contener /.'),
  sessionId: z.string().min(1).max(128).regex(/^[^/]+$/, 'sessionId no debe contener /.'),
  bootId: z.string().uuid('bootId debe ser un UUID válido.'),
  sequence: z.number().int().min(0).max(4294967295),
  capturedAt: z.string().datetime({ message: 'capturedAt debe ser una fecha ISO 8601 UTC terminada en Z, o null.' }).nullable(),
  measurements: z.object({
    heartRate: testVital('bpm', 0, 300, true),
    spo2: testVital('%', 0, 100),
    skinTemperature: testVital('C', -55, 125),
  }).strict(),
}).strict();

/** Solo se monta en development desde createApp; sin autenticación ni persistencia. */
export const readingTestRouter = Router();

readingTestRouter.post('/reading-test', (req, res) => {
  const reading = readingTestSchema.parse(req.body);
  const receivedAt = new Date().toISOString();

  // Solo campos validados: nunca imprimir req, cuerpo crudo, cookies o cabeceras.
  // JSON.stringify escapa saltos de línea: exactamente un objeto JSON por POST.
  console.info(JSON.stringify(reading));

  sendSuccess(res, { received: true, deviceId: reading.deviceId, receivedAt, persisted: false });
});
