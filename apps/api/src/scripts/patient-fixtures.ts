import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { assertDisposableEmulators } from './emulator-fixtures.js';
import { PersistenceError } from '../shared/persistence.js';
import { writeAudit } from '../modules/audit/audit.repository.js';
import type { StoredMeasurement } from '../modules/measurements/measurements.repository.js';

// Synthetic initial data only. Fixed document IDs plus a transaction marker
// make reruns non-destructive and allow history across two boards to be shown.
export async function seedPatientDataset(db: Firestore) {
  assertDisposableEmulators();
  const marker = db.collection('demoFixtures').doc('patient-history-v2');
  const p = db.collection('patients').doc('demo-patient-a');
  const emptyPatient = db.collection('patients').doc('demo-patient-b');
  const d1 = db.collection('devices').doc('demo-device-1');
  const d2 = db.collection('devices').doc('demo-device-2');
  const a1 = db.collection('assignments').doc('demo-assignment-1');
  const a2 = db.collection('assignments').doc('demo-assignment-2');
  const s1 = db.collection('sessions').doc('demo-session-1');
  const s2 = db.collection('sessions').doc('demo-session-2');
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return db.runTransaction(async (tx) => {
    if ((await tx.get(marker)).exists) return { datasetCreated: false };
    const [first, ...others] = await tx.getAll(d1, p, emptyPatient, d2, a1, a2, s1, s2);
    if (!first.exists || !first.data()?.enabled || first.data()?.source !== 'simulated' || first.data()?.activeAssignmentId ||
      first.data()?.activeSessionId || first.data()?.lastSeenAt || others.some((snapshot) => snapshot.exists)) {
      throw new PersistenceError('PROVISIONING_CONFLICT', 'Los IDs de la semilla ya tienen datos; no se sobrescriben.');
    }
    const now = Date.now();
    const date = (offset: number) => new Date(now + offset).toISOString();
    tx.create(p, { id: p.id, code: 'P-DEMO-A', displayName: 'Paciente de demostración A', enabled: true,
      activeAssignmentId: a2.id, createdAt: date(-180000), updatedAt: date(-60000) });
    tx.create(emptyPatient, { id: emptyPatient.id, code: 'P-DEMO-B', displayName: 'Paciente de demostración B', enabled: true,
      activeAssignmentId: null, createdAt: date(-180000), updatedAt: date(-180000) });
    tx.update(d1, { activeAssignmentId: null, activeSessionId: null, lastSeenAt: date(-134000) });
    tx.create(d2, { deviceId: d2.id, code: 'SIM-2', board: 'simulator', source: 'simulated', enabled: true,
      activeAssignmentId: a2.id, activeSessionId: s2.id, lastSeenAt: date(-2000), createdAt: date(-60000), updatedAt: date(-60000) });
    for (const [a, d, s, closed] of [[a1, d1, s1, true], [a2, d2, s2, false]] as const) {
      const start = closed ? -180000 : -60000;
      tx.create(a, { id: a.id, patientId: p.id, deviceId: d.id, startedAt: date(start), endedAt: closed ? date(-120000) : null,
        assignedBy: 'demo-admin', endedBy: closed ? 'demo-admin' : null, status: closed ? 'closed' : 'active', openSessionId: closed ? null : s.id });
      const bootId = randomUUID();
      let latest: StoredMeasurement | null = null;
      for (let sequence = 0; sequence < 24; sequence++) {
        const receivedAt = date((closed ? -180000 : -48000) + sequence * 2000);
        const noContact = sequence % 7 === 0;
        const payload = { sessionId: s.id, bootId, sequence, capturedAt: null, measurements: {
          heartRate: { value: noContact ? null : 74 + sequence % 5, unit: 'bpm' as const, status: noContact ? 'no_contact' as const : 'valid' as const },
          spo2: { value: noContact ? null : 97, unit: '%' as const, status: noContact ? 'no_contact' as const : 'valid' as const },
          skinTemperature: { value: 33.1 + (sequence % 3) / 10, unit: 'C' as const, status: 'valid' as const },
        } };
        const id = `reading-${String(sequence).padStart(2, '0')}`;
        latest = { ...payload, id, patientId: p.id, assignmentId: a.id, deviceId: d.id, source: 'simulated', receivedAt };
        tx.create(s.collection('measurements').doc(id), latest);
        tx.create(db.collection('ingestionKeys').doc(hash([d.id, bootId, sequence])), { payloadHash: hash(payload), measurementId: id, receivedAt });
      }
      tx.create(s, { sessionId: s.id, patientId: p.id, deviceId: d.id, assignmentId: a.id, operatorId: 'demo-admin', source: 'simulated',
        status: closed ? 'finished' : 'active', createdAt: date(start), startedAt: date(start), finishedAt: closed ? date(-120000) : null, latestMeasurement: latest });
    }
    writeAudit(tx, db, { actorId: 'demo-admin', action: 'patient.create', targetType: 'patient', targetId: p.id });
    writeAudit(tx, db, { actorId: 'demo-admin', action: 'patient.create', targetType: 'patient', targetId: emptyPatient.id });
    tx.create(marker, { version: 2, createdAt: date(0), source: 'simulated' });
    return { datasetCreated: true };
  });
}
