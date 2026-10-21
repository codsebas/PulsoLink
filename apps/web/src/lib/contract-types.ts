/**
 * Tipos espejo de los schemas de `contracts/web.openapi.yaml` (2.0.0).
 * El contrato es la fuente de verdad; si cambia, actualizar aquí y notificar
 * en el issue de coordinación.
 */

export type Role = 'admin' | 'viewer';
export type DeviceSource = 'real' | 'simulated';
export type SessionStatus = 'created' | 'active' | 'finished';
export type AssignmentStatusFilter = 'active' | 'closed';
export type AuditResult = 'success' | 'failure';
export type ConnectionState =
  | 'disconnected'
  | 'connected_without_valid_reading'
  | 'connected_with_recent_reading';

export interface AuthUser {
  id: string;
  displayName: string;
  role: Role;
}

export interface User {
  id: string;
  displayName: string;
  role: Role;
  enabled: boolean;
  createdAt: string;
}

export interface Patient {
  id: string;
  code: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  code: string;
  hardwareId?: string;
  source: DeviceSource;
  enabled: boolean;
  activeSessionId: string | null;
  lastSeenAt: string | null;
}

export interface Assignment {
  id: string;
  patientId: string;
  deviceId: string;
  startedAt: string;
  endedAt: string | null;
  assignedBy: string;
  endedBy: string | null;
}

export interface Session {
  id: string;
  patientId: string;
  deviceId: string;
  assignmentId: string;
  source: DeviceSource;
  status: SessionStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  latestMeasurement: Measurement | null;
}

export interface Measurement {
  id: string;
  patientId: string;
  deviceId: string;
  assignmentId: string;
  sessionId: string;
  receivedAt: string;
  capturedAt: string | null;
  bootId: string;
  sequence: number;
  measurements: Measurements;
  source: DeviceSource;
}

export interface Measurements {
  heartRate: VitalReading;
  spo2: VitalReading;
  skinTemperature: VitalReading;
}

export type VitalStatus = 'valid' | 'no_contact' | 'invalid' | 'unavailable';

export type VitalReading =
  | { value: number; unit: string; status: 'valid' }
  | { value: null; unit: string; status: Exclude<VitalStatus, 'valid'> };

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  occurredAt: string;
  result: AuditResult;
  context: Record<string, unknown>;
}

/** Códigos de conflicto que la UI debe traducir a mensajes accionables. */
export const CONFLICT_CODES = {
  ASSIGNMENT_IN_USE: 'ASSIGNMENT_IN_USE',
  ASSIGNMENT_CONFLICT: 'ASSIGNMENT_CONFLICT',
  DEVICE_BUSY: 'DEVICE_BUSY',
  SESSION_NOT_ACTIVE: 'SESSION_NOT_ACTIVE',
  ASSIGNMENT_NOT_ACTIVE: 'ASSIGNMENT_NOT_ACTIVE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
} as const;
