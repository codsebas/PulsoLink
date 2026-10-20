import { getDb } from '../../config/firebase.js';
import { PersistenceError } from '../../shared/persistence.js';
import { PatientsRepository } from './patients.repository.js';
import { MeasurementsRepository, type StoredMeasurement } from '../measurements/measurements.repository.js';
import { AuditRepository } from '../audit/audit.repository.js';
import type { Firestore } from 'firebase-admin/firestore';

export function monitoringMeta(measurement: StoredMeasurement | null, lastSeenAt: string | null, now = Date.now()) {
  const ageMs = measurement ? Math.max(0, now - Date.parse(measurement.receivedAt)) : null;
  const deviceOnline = lastSeenAt !== null && now - Date.parse(lastSeenAt) <= 45000;
  const stale = ageMs === null || ageMs > 10000;
  const hasValid = measurement && Object.values(measurement.measurements).some((value) => value.status === 'valid' && value.value !== null);
  const connectionState = !deviceOnline ? 'disconnected' : stale || !hasValid ? 'connected_without_valid_reading' : 'connected_with_recent_reading';
  return { serverTime: new Date(now).toISOString(), lastSeenAt, deviceOnline, ageMs, stale, connectionState };
}
export function patientDto(patient: NonNullable<Awaited<ReturnType<PatientsRepository['getById']>>>) {
  const { id, code, displayName, enabled, createdAt, updatedAt } = patient;
  return { id, code, displayName, enabled, createdAt, updatedAt };
}
export class PatientMonitoringService {
  readonly patients: PatientsRepository;
  readonly measurements: MeasurementsRepository;
  readonly audit: AuditRepository;
  constructor(private readonly db: () => Firestore = getDb) {
    this.patients = new PatientsRepository(db); this.measurements = new MeasurementsRepository(db); this.audit = new AuditRepository(db);
  }
  async get(patientId: string) {
    const patient = await this.patients.getById(patientId);
    if (!patient) throw new PersistenceError('PATIENT_NOT_FOUND', 'Paciente no encontrado.');
    return patient;
  }
  async latest(patientId: string) {
    const db = this.db();
    // Read one consistent transaction snapshot while boards may be reassigned.
    return db.runTransaction(async (tx) => {
      const p = await tx.get(db.collection('patients').doc(patientId));
      if (!p.exists) throw new PersistenceError('PATIENT_NOT_FOUND', 'Paciente no encontrado.');
      const patient = p.data()!;
      if (!patient.activeAssignmentId) return { data: null, meta: monitoringMeta(null, null) };
      const a = await tx.get(db.collection('assignments').doc(patient.activeAssignmentId));
      const assignment = a.data();
      if (!assignment || assignment.endedAt || assignment.patientId !== patientId) return { data: null, meta: monitoringMeta(null, null) };
      const d = await tx.get(db.collection('devices').doc(assignment.deviceId));
      const device = d.data();
      if (!device || device.activeAssignmentId !== a.id) return { data: null, meta: monitoringMeta(null, null) };
      const session = assignment.openSessionId ? (await tx.get(db.collection('sessions').doc(assignment.openSessionId))).data() : undefined;
      const active = patient.enabled && device.enabled && session?.status === 'active' && session.assignmentId === a.id &&
        session.patientId === patientId && session.deviceId === d.id && device.activeSessionId === session.sessionId;
      const reading: StoredMeasurement | null = active ? session.latestMeasurement ?? null : null;
      const data = reading?.patientId === patientId && reading.assignmentId === a.id && reading.deviceId === d.id ? reading : null;
      return { data, meta: monitoringMeta(data, device.enabled ? device.lastSeenAt : null) };
    });
  }
}
