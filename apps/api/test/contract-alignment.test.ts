import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { errorHandler, AppError } from '../src/middleware/error-handler.js';
import { PersistenceError } from '../src/shared/persistence.js';
import { AuthError } from '../src/modules/auth/auth.errors.js';

describe('OpenAPI 2.0.0 & Zod contract alignment (Issue #27, A08)', () => {
  function runErrorHandler(err: Error): { status: number; body: Record<string, any> } {
    const req = { headers: { 'x-request-id': 'req-test-123' }, method: 'POST', originalUrl: '/test' } as unknown as Request;
    let statusCode = 200;
    let responseBody: any = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: any) {
        responseBody = payload;
        return this;
      },
    } as unknown as Response;

    errorHandler(err, req, res, vi.fn());
    return { status: statusCode, body: responseBody };
  }

  describe('Specific error codes vs generic mapping', () => {
    it('maps CSRF_INVALID to 403 Forbidden', () => {
      const err = new AuthError(403, 'CSRF_INVALID', 'Origen no permitido o token CSRF inválido.');
      const res = runErrorHandler(err);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
      expect(res.body.error.requestId).toBe('req-test-123');
    });

    it.each([
      ['PATIENT_NOT_FOUND', 'Paciente no encontrado.'],
      ['DEVICE_NOT_FOUND', 'Dispositivo no encontrado.'],
      ['SESSION_NOT_FOUND', 'Sesión no encontrada.'],
      ['ASSIGNMENT_NOT_FOUND', 'Asignación no encontrada.'],
      ['USER_NOT_FOUND', 'Usuario no encontrado.'],
      ['AUDIT_NOT_FOUND', 'Registro de auditoría no encontrado.'],
    ])('maps %s to 404 Not Found', (code, message) => {
      const err = new PersistenceError(code, message);
      const res = runErrorHandler(err);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(code);
      expect(res.body.error.message).toBe(message);
    });

    it('maps INVALID_CURSOR to 400 Bad Request', () => {
      const err = new PersistenceError('INVALID_CURSOR', 'El cursor no corresponde a esta consulta.');
      const res = runErrorHandler(err);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CURSOR');
    });

    it('maps INVALID_SESSION_STATE to 409 Conflict', () => {
      const err = new PersistenceError('INVALID_SESSION_STATE', 'La transición de sesión no está permitida.');
      const res = runErrorHandler(err);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_SESSION_STATE');
    });

    it('maps RESOURCE_DISABLED to 403 Forbidden', () => {
      const err = new PersistenceError('RESOURCE_DISABLED', 'Paciente o placa deshabilitados.');
      const res = runErrorHandler(err);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('RESOURCE_DISABLED');
    });

    it('maps ASSIGNMENT_IN_USE to 409 Conflict', () => {
      const err = new PersistenceError('ASSIGNMENT_IN_USE', 'Finalice primero la sesión abierta.');
      const res = runErrorHandler(err);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSIGNMENT_IN_USE');
    });

    it('maps ASSIGNMENT_CONFLICT to 409 Conflict', () => {
      const err = new PersistenceError('ASSIGNMENT_CONFLICT', 'Paciente o placa ya reservados.');
      const res = runErrorHandler(err);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSIGNMENT_CONFLICT');
    });
  });

  describe('Contract regex alignment', () => {
    const documentIdPattern = /^(?!\.{1,2}$)[^/]+$/;
    const dateOffsetPattern = /(Z|[+-]\d{2}:\d{2})$/;

    it('documentId pattern rejects dot and double-dot traversal and slashes', () => {
      expect(documentIdPattern.test('.')).toBe(false);
      expect(documentIdPattern.test('..')).toBe(false);
      expect(documentIdPattern.test('a/b')).toBe(false);
      expect(documentIdPattern.test('/path')).toBe(false);

      expect(documentIdPattern.test('...')).toBe(true);
      expect(documentIdPattern.test('patient-001')).toBe(true);
      expect(documentIdPattern.test('device_node_1')).toBe(true);
      expect(documentIdPattern.test('user.test')).toBe(true);
    });

    it('dateOffsetPattern accepts UTC Z and timezone offsets, rejecting bare dates', () => {
      expect(dateOffsetPattern.test('2026-10-22T01:00:00Z')).toBe(true);
      expect(dateOffsetPattern.test('2026-10-22T01:00:00.000Z')).toBe(true);
      expect(dateOffsetPattern.test('2026-10-22T02:00:00+01:00')).toBe(true);
      expect(dateOffsetPattern.test('2026-10-21T19:00:00-06:00')).toBe(true);

      expect(dateOffsetPattern.test('2026-10-22T01:00:00')).toBe(false);
      expect(dateOffsetPattern.test('2026-10-22')).toBe(false);
      expect(dateOffsetPattern.test('ayer')).toBe(false);
    });
  });

  describe('OpenAPI 2.0.0 contract file verification', () => {
    it('contracts/device.openapi.yaml contains updated patterns and error catalogue', () => {
      const deviceContract = readFileSync(resolve(process.cwd(), '../../contracts/device.openapi.yaml'), 'utf8');
      expect(deviceContract).toContain('version: 2.0.0');
      expect(deviceContract).toContain('pattern: ^(?!\\.{1,2}$)[^/]+$');
      expect(deviceContract).toContain('pattern: (Z|[+-]\\d{2}:\\d{2})$');
      expect(deviceContract).toContain('CSRF_INVALID');
      expect(deviceContract).toContain('RESOURCE_DISABLED');
      expect(deviceContract).toContain('INVALID_CURSOR');
      expect(deviceContract).toContain('INVALID_SESSION_STATE');
      expect(deviceContract).toContain('ASSIGNMENT_IN_USE');
      expect(deviceContract).toContain('ASSIGNMENT_CONFLICT');
      expect(deviceContract).toContain('PATIENT_NOT_FOUND');
      expect(deviceContract).toContain('DEVICE_NOT_FOUND');
    });

    it('contracts/web.openapi.yaml contains updated patterns and error catalogue', () => {
      const webContract = readFileSync(resolve(process.cwd(), '../../contracts/web.openapi.yaml'), 'utf8');
      expect(webContract).toContain('version: 2.0.0');
      expect(webContract).toContain('pattern: ^(?!\\.{1,2}$)[^/]+$');
      expect(webContract).toContain('pattern: (Z|[+-]\\d{2}:\\d{2})$');
      expect(webContract).toContain('CSRF_INVALID');
      expect(webContract).toContain('RESOURCE_DISABLED');
      expect(webContract).toContain('INVALID_CURSOR');
      expect(webContract).toContain('INVALID_SESSION_STATE');
      expect(webContract).toContain('ASSIGNMENT_IN_USE');
      expect(webContract).toContain('ASSIGNMENT_CONFLICT');
      expect(webContract).toContain('PATIENT_NOT_FOUND');
      expect(webContract).toContain('DEVICE_NOT_FOUND');
      expect(webContract).toContain('SESSION_NOT_FOUND');
      expect(webContract).toContain('ASSIGNMENT_NOT_FOUND');
      expect(webContract).toContain('USER_NOT_FOUND');
      expect(webContract).toContain('AUDIT_NOT_FOUND');
    });
  });
});
