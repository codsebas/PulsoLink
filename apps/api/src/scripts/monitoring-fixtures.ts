import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { assertDisposableEmulators } from './emulator-fixtures.js';
import { PersistenceError } from '../shared/persistence.js';
import { writeAudit } from '../modules/audit/audit.repository.js';
import type { StoredMeasurement } from '../modules/measurements/measurements.repository.js';

/**
 * Datos de prueba seudónimos para la capa de monitoreo e historial (#31).
 *
 * El conjunto obliga a ejercitar la paginación por cursor: 240 lecturas con
 * empates temporales (tres lecturas comparten el mismo milisegundo), repartidas
 * en dos placas y dos sesiones separadas por una desconexión de quince
 * segundos. Con el límite de página de 100 se necesitan tres páginas.
 *
 * No contiene datos reales de pacientes ni valores clínicos: todo es sintético
 * y solo se crea en emuladores desechables.
 */

const GROUPS_PER_SESSION = 40;
const READINGS_PER_GROUP = 3;
/** Segundos de desconexión entre el tramo de la placa 1 y el de la placa 2. */
const DISCONNECTION_SECONDS = 15;

export async function seedMonitoringDataset(db: Firestore) {
  assertDisposableEmulators();
  const marker = db.collection('demoFixtures').doc('monitoring-history-v1');
  const patient = db.collection('patients').doc('monitor-patient');
  const deviceOne = db.collection('devices').doc('monitor-device-1');
  const deviceTwo = db.collection('devices').doc('monitor-device-2');
  const assignmentOne = db.collection('assignments').doc('monitor-assignment-1');
  const assignmentTwo = db.collection('assignments').doc('monitor-assignment-2');
  const sessionOne = db.collection('sessions').doc('monitor-session-1');
  const sessionTwo = db.collection('sessions').doc('monitor-session-2');
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return db.runTransaction(async (tx) => {
    if ((await tx.get(marker)).exists) return { datasetCreated: false, readings: 0 };
    const [first, ...others] = await tx.getAll(deviceOne, deviceTwo, patient, assignmentOne, assignmentTwo, sessionOne, sessionTwo);
    if ([first, ...others].some((snapshot) => snapshot.exists)) {
      throw new PersistenceError('PROVISIONING_CONFLICT', 'Los IDs de la semilla de monitoreo ya tienen datos; no se sobrescriben.');
    }
    const now = Date.now();
    const startedAt = new Date(now - (GROUPS_PER_SESSION * 2 + DISCONNECTION_SECONDS) * 1000).toISOString();
    const date = (offsetSeconds: number) => new Date(Date.parse(startedAt) + offsetSeconds * 1000).toISOString();

    tx.create(patient, { id: patient.id, code: 'P-MONITOR', displayName: 'Paciente seudónimo de monitoreo', enabled: true,
      activeAssignmentId: assignmentTwo.id, createdAt: startedAt, updatedAt: date(0) });
    tx.create(deviceOne, { deviceId: deviceOne.id, code: 'SIM-MON-1', board: 'simulator', source: 'simulated', enabled: true,
      activeAssignmentId: null, activeSessionId: null, lastSeenAt: date(GROUPS_PER_SESSION - 1), createdAt: startedAt, updatedAt: date(0) });
    tx.create(deviceTwo, { deviceId: deviceTwo.id, code: 'SIM-MON-2', board: 'simulator', source: 'simulated', enabled: true,
      activeAssignmentId: assignmentTwo.id, activeSessionId: sessionTwo.id, lastSeenAt: date(0), createdAt: startedAt, updatedAt: date(0) });

    const closedAt = date(GROUPS_PER_SESSION - 1);
    tx.create(assignmentOne, { id: assignmentOne.id, patientId: patient.id, deviceId: deviceOne.id, startedAt,
      endedAt: closedAt, assignedBy: 'demo-admin', endedBy: 'demo-admin', status: 'closed', openSessionId: null });
    tx.create(assignmentTwo, { id: assignmentTwo.id, patientId: patient.id, deviceId: deviceTwo.id, startedAt: closedAt,
      endedAt: null, assignedBy: 'demo-admin', endedBy: null, status: 'active', openSessionId: sessionTwo.id });

    const bootOne = randomUUID();
    const bootTwo = randomUUID();
    let latest: StoredMeasurement | null = null;
    let readings = 0;

    const writeGroup = (sessionId: string, assignmentId: string, deviceId: string, bootId: string, group: number, offsetSeconds: number) => {
      const receivedAt = date(offsetSeconds);
      for (let item = 0; item < READINGS_PER_GROUP; item++) {
        const sequence = group * READINGS_PER_GROUP + item;
        const noContact = sequence % 7 === 0;
        const payload = { sessionId, bootId, sequence, capturedAt: receivedAt, measurements: {
          heartRate: { value: noContact ? null : 72 + (sequence % 6), unit: 'bpm' as const, status: noContact ? 'no_contact' as const : 'valid' as const },
          spo2: { value: noContact ? null : 96 + (sequence % 3), unit: '%' as const, status: noContact ? 'no_contact' as const : 'valid' as const },
          skinTemperature: { value: 33 + (sequence % 4) / 10, unit: 'C' as const, status: 'valid' as const },
        } };
        const id = `monitor-${String(sequence).padStart(3, '0')}`;
        const measurement: StoredMeasurement = { ...payload, id, patientId: patient.id, assignmentId, deviceId,
          source: 'simulated', receivedAt };
        tx.create(db.collection('sessions').doc(sessionId).collection('measurements').doc(id), measurement);
        tx.create(db.collection('ingestionKeys').doc(hash([deviceId, bootId, sequence])), { payloadHash: hash(payload), measurementId: id, receivedAt });
        readings += 1;
        if (!latest || receivedAt >= latest.receivedAt) latest = measurement;
      }
    };

    for (let group = 0; group < GROUPS_PER_SESSION; group++) {
      writeGroup(sessionOne.id, assignmentOne.id, deviceOne.id, bootOne, group, group);
    }
    for (let group = 0; group < GROUPS_PER_SESSION; group++) {
      writeGroup(sessionTwo.id, assignmentTwo.id, deviceTwo.id, bootTwo, group, GROUPS_PER_SESSION + DISCONNECTION_SECONDS + group);
    }

    tx.create(sessionOne, { sessionId: sessionOne.id, patientId: patient.id, deviceId: deviceOne.id, assignmentId: assignmentOne.id,
      operatorId: 'demo-admin', source: 'simulated', status: 'finished', createdAt: startedAt, startedAt, finishedAt: closedAt, latestMeasurement: null });
    tx.create(sessionTwo, { sessionId: sessionTwo.id, patientId: patient.id, deviceId: deviceTwo.id, assignmentId: assignmentTwo.id,
      operatorId: 'demo-admin', source: 'simulated', status: 'active', createdAt: closedAt, startedAt: closedAt, finishedAt: null, latestMeasurement: latest });
    writeAudit(tx, db, { actorId: 'demo-admin', action: 'patient.create', targetType: 'patient', targetId: patient.id });
    tx.create(marker, { version: 1, createdAt: date(0), source: 'simulated' });
    return { datasetCreated: true, readings };
  });
}
