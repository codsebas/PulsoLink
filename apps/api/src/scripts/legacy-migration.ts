import { createHash } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import { FieldPath, type DocumentData, type Firestore, type Query } from 'firebase-admin/firestore';
import { z } from 'zod';
import { dateTime, documentId, PersistenceError } from '../shared/persistence.js';
import { writeAudit } from '../modules/audit/audit.repository.js';

export const migrationManifestSchema = z.object({
  version: z.literal(1), actorId: documentId, migrateOperators: z.boolean(),
  sessions: z.array(z.object({ sessionId: documentId, patientId: documentId, assignmentId: documentId }).strict())
    .refine((rows) => new Set(rows.map((row) => row.sessionId)).size === rows.length, 'Sesión duplicada'),
}).strict();
export type MigrationManifest = z.infer<typeof migrationManifestSchema>;
export interface BackupRecord { path: string; data: DocumentData }

async function scan(query: Query): Promise<BackupRecord[]> {
  const records: BackupRecord[] = [];
  let cursor: string | undefined;
  while (true) {
    let page = query.orderBy(FieldPath.documentId()).limit(200);
    if (cursor) page = page.startAfter(cursor);
    const snapshot = await page.get();
    records.push(...snapshot.docs.map((doc) => ({ path: doc.ref.path, data: doc.data() })));
    if (snapshot.size < 200) return records;
    cursor = snapshot.docs[snapshot.size - 1].ref.path;
    // Collection queries need an ID; collection-group queries need the full path.
    if (!cursor.includes('/measurements/')) cursor = snapshot.docs[snapshot.size - 1].id;
  }
}

export async function inventoryLegacy(db: Firestore) {
  const groups = await Promise.all(['users', 'patients', 'devices', 'assignments', 'sessions', 'ingestionKeys', 'auditLogs', 'migrationRecords']
    .map((name) => scan(db.collection(name))));
  groups.push(await scan(db.collectionGroup('measurements')));
  return groups.flat();
}
const recordKey = (path: string) => createHash('sha256').update(path).digest('hex');

export async function migrateLegacy(db: Firestore, auth: Pick<Auth, 'revokeRefreshTokens'>, input: MigrationManifest, options: {
  apply: boolean; backup: (records: BackupRecord[]) => Promise<void>;
}) {
  const manifest = migrationManifestSchema.parse(input);
  const records = await inventoryLegacy(db);
  const byPath = new Map(records.map((record) => [record.path, record.data]));
  const unresolved = records.filter((record) => /^sessions\/[^/]+$/.test(record.path) && !record.data.patientId &&
    !manifest.sessions.some((mapping) => record.path === `sessions/${mapping.sessionId}`)).map((record) => record.path);
  // All explicit mappings are preflighted before the backup or any mutation.
  for (const mapping of manifest.sessions) {
    const session = byPath.get(`sessions/${mapping.sessionId}`);
    const patient = byPath.get(`patients/${mapping.patientId}`);
    const assignment = byPath.get(`assignments/${mapping.assignmentId}`);
    if (!session || !patient || !assignment || session.status !== 'finished' || !session.finishedAt || !assignment.endedAt ||
      assignment.patientId !== mapping.patientId || assignment.deviceId !== session.deviceId ||
      (session.patientId && session.patientId !== mapping.patientId) || (session.assignmentId && session.assignmentId !== mapping.assignmentId)) {
      throw new PersistenceError('MIGRATION_CONFLICT', 'Correspondencia confirmada inválida; no se modifica el legado.');
    }
    const measurements = records.filter((record) => record.path.startsWith(`sessions/${mapping.sessionId}/measurements/`));
    dateTime.parse(assignment.startedAt);
    dateTime.parse(assignment.endedAt);
    dateTime.parse(session.finishedAt);
    for (const measurement of measurements) {
      const data = measurement.data;
      dateTime.parse(data.receivedAt);
      if (data.deviceId !== session.deviceId || data.sessionId !== mapping.sessionId ||
        data.receivedAt < assignment.startedAt || data.receivedAt > assignment.endedAt ||
        (data.patientId && data.patientId !== mapping.patientId) || (data.assignmentId && data.assignmentId !== mapping.assignmentId)) {
        throw new PersistenceError('MIGRATION_CONFLICT', 'Una lectura no coincide con la correspondencia confirmada.');
      }
    }
  }
  const operatorProfiles = records.filter((record) => /^users\/[^/]+$/.test(record.path) && record.data.role === 'operator');
  const report = { apply: options.apply, records: records.length, operatorProfiles: operatorProfiles.length,
    sessionMappings: manifest.sessions.length, unresolved };
  if (!options.apply) return report;
  // This callback must durably save the exact inventory. A backup failure means
  // no Firestore/Auth mutation. CLI writes outside the checkout with flag wx.
  await options.backup(records);
  if (manifest.migrateOperators) {
    for (const record of records.filter((row) => /^users\/[^/]+$/.test(row.path))) {
      const ref = db.doc(record.path);
      const journalRef = db.collection('migrationRecords').doc(recordKey(record.path));
      const uid = ref.id;
      const shouldRevoke = await db.runTransaction(async (tx) => {
        const [current, journal] = await tx.getAll(ref, journalRef);
        if (current.data()?.role === 'operator') {
          tx.update(ref, { role: 'viewer' });
          tx.create(journalRef, { path: record.path, version: 1, fromRole: 'operator', toRole: 'viewer', revocationPending: true, migratedAt: new Date().toISOString() });
          writeAudit(tx, db, { actorId: manifest.actorId, action: 'user.update', targetType: 'user', targetId: uid });
          return true;
        }
        return current.data()?.role === 'viewer' && journal.data()?.revocationPending === true;
      });
      if (shouldRevoke) {
        await auth.revokeRefreshTokens(uid);
        await journalRef.update({ revocationPending: false });
      }
    }
  }
  for (const mapping of manifest.sessions) {
    const ids = { patientId: mapping.patientId, assignmentId: mapping.assignmentId };
    // A maintenance window is required: do not expose a partly migrated history.
    for (const record of records.filter((row) => row.path.startsWith(`sessions/${mapping.sessionId}/measurements/`))) {
      await db.runTransaction(async (tx) => {
        const ref = db.doc(record.path);
        const [readingSnapshot, sessionSnapshot, assignmentSnapshot] = await tx.getAll(ref, db.collection('sessions').doc(mapping.sessionId), db.collection('assignments').doc(mapping.assignmentId));
        const current = readingSnapshot.data();
        const session = sessionSnapshot.data();
        const assignment = assignmentSnapshot.data();
        if (!current || !session || session.status !== 'finished' || !assignment?.endedAt || assignment.patientId !== ids.patientId ||
          assignment.deviceId !== session.deviceId || current.deviceId !== record.data.deviceId || current.sessionId !== mapping.sessionId ||
          current.receivedAt !== record.data.receivedAt || (current.patientId && current.patientId !== ids.patientId) || (current.assignmentId && current.assignmentId !== ids.assignmentId)) {
          throw new PersistenceError('MIGRATION_CONFLICT', 'La lectura cambió durante la migración.');
        }
        if (!current.patientId || !current.assignmentId) tx.update(ref, ids);
      });
    }
    await db.runTransaction(async (tx) => {
      const ref = db.collection('sessions').doc(mapping.sessionId);
      const aRef = db.collection('assignments').doc(mapping.assignmentId);
      const [snapshot, a] = await tx.getAll(ref, aRef);
      const session = snapshot.data();
      if (!session || session.status !== 'finished' || !a.data()?.endedAt || a.data()?.patientId !== ids.patientId || a.data()?.deviceId !== session.deviceId ||
        (session.patientId && session.patientId !== ids.patientId) || (session.assignmentId && session.assignmentId !== ids.assignmentId)) {
        throw new PersistenceError('MIGRATION_CONFLICT', 'La sesión cambió durante la migración.');
      }
      if (!session.patientId || !session.assignmentId) {
        const changes: DocumentData = { ...ids };
        if (session.latestMeasurement) changes.latestMeasurement = { ...session.latestMeasurement, ...ids };
        tx.update(ref, changes);
        const journal = db.collection('migrationRecords').doc(recordKey(ref.path));
        tx.create(journal, { path: ref.path, version: 1, ...ids, confirmedBy: manifest.actorId, migratedAt: new Date().toISOString() });
      }
    });
  }
  return report;
}
