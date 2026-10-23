import { afterAll, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { migrateLegacy } from '../src/scripts/legacy-migration.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
describe.skipIf(!enabled)('PL2 legacy migration', () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (enabled && !projectId?.startsWith('demo-')) throw new Error('Solo demo-.');
  const app = enabled ? initializeApp({ projectId }, `migration-${randomUUID()}`) : undefined;
  const db = app ? getFirestore(app) : undefined!;
  afterAll(async () => { if (app) await deleteApp(app); });
  async function fixture() {
    const id = randomUUID();
    const paths = { user: `users/${id}`, session: `sessions/${id}`, patient: `patients/${id}`, assignment: `assignments/${id}`, key: `ingestionKeys/${id}` };
    const reading = { id, sessionId: id, deviceId: id, bootId: id, sequence: 5, capturedAt: null,
      receivedAt: '2026-10-18T00:01:00.000Z', source: 'simulated', measurements: {} };
    const batch = db.batch();
    batch.set(db.doc(paths.user), { uid: id, role: 'operator', enabled: true, displayName: 'Legado' });
    batch.set(db.doc(paths.patient), { id, enabled: true, code: 'CONFIRMED', displayName: 'Alias confirmado' });
    batch.set(db.doc(paths.assignment), { id, patientId: id, deviceId: id, assignedBy: 'confirmed-admin', endedBy: 'confirmed-admin',
      startedAt: '2026-10-18T00:00:00.000Z', endedAt: '2026-10-18T00:02:00.000Z', status: 'closed', openSessionId: null });
    batch.set(db.doc(paths.session), { sessionId: id, participantCode: 'SAME-AMBIGUOUS-CODE', operatorId: id, deviceId: id,
      status: 'finished', startedAt: '2026-10-18T00:00:00.000Z', finishedAt: '2026-10-18T00:02:00.000Z', latestMeasurement: reading });
    batch.set(db.doc(`${paths.session}/measurements/${id}`), reading);
    batch.set(db.doc(paths.key), { payloadHash: 'original-hash-must-not-change', measurementId: id, receivedAt: reading.receivedAt });
    await batch.commit();
    return { id, paths, reading, manifest: { version: 1 as const, actorId: 'migration-admin', migrateOperators: false, sessions: [{ sessionId: id, patientId: id, assignmentId: id }] } };
  }
  it('dry-runs without inference, requires backup and preserves ingestion keys across repeated applications', async () => {
    const { id, paths, manifest } = await fixture();
    const auth = { revokeRefreshTokens: vi.fn(async () => {}) };
    const backup = vi.fn(async () => {});
    const dry = await migrateLegacy(db, auth, { ...manifest, sessions: [] }, { apply: false, backup });
    expect(dry.unresolved).toContain(paths.session);
    expect(backup).not.toHaveBeenCalled();
    expect((await db.doc(paths.session).get()).data()?.patientId).toBeUndefined();
    await expect(migrateLegacy(db, auth, manifest, { apply: true, backup: async () => { throw new Error('disk full'); } })).rejects.toThrow('disk full');
    expect((await db.doc(paths.session).get()).data()?.patientId).toBeUndefined();
    const key = (await db.doc(paths.key).get()).data();
    await migrateLegacy(db, auth, manifest, { apply: true, backup });
    const stored = (await db.doc(`${paths.session}/measurements/${id}`).get()).data();
    expect(stored?.patientId).toBe(id);
    expect(stored?.assignmentId).toBe(id);
    expect((await db.doc(paths.session).get()).data()?.latestMeasurement.patientId).toBe(id);
    await migrateLegacy(db, auth, manifest, { apply: true, backup });
    expect((await db.doc(`${paths.session}/measurements/${id}`).get()).data()).toEqual(stored);
    expect((await db.doc(paths.key).get()).data()).toEqual(key);
  }, 30000);
  it('refuses a fabricated patient/assignment mapping before making any write', async () => {
    const { paths, manifest } = await fixture();
    const backup = vi.fn(async () => {});
    await expect(migrateLegacy(db, { revokeRefreshTokens: vi.fn() }, { ...manifest,
      sessions: [{ ...manifest.sessions[0], patientId: 'unconfirmed-patient' }],
    }, { apply: true, backup })).rejects.toMatchObject({ code: 'MIGRATION_CONFLICT' });
    expect(backup).not.toHaveBeenCalled();
    expect((await db.doc(paths.session).get()).data()?.patientId).toBeUndefined();
  });
  it('executes CLI dry-run and requires an external durable backup before applying', async () => {
    const { paths, manifest } = await fixture();
    const directory = await mkdtemp(join(tmpdir(), 'pulsolink-migration-test-'));
    const manifestPath = join(directory, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest));
    const run = (...args: string[]) => spawnSync(process.execPath, [resolve('../../node_modules/tsx/dist/cli.mjs'),
      'src/scripts/migrate-legacy.ts', `--manifest=${manifestPath}`, ...args], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 30000 });
    try {
      const dry = run();
      expect(dry.status).toBe(0);
      expect((await db.doc(paths.session).get()).data()?.patientId).toBeUndefined();
      expect(run('--apply', `--backup-dir=${resolve('../..', '.cache', 'refused-backup')}`).status).toBe(1);
      expect((await db.doc(paths.session).get()).data()?.patientId).toBeUndefined();
      const synced = spawnSync(process.execPath, [resolve('../../node_modules/tsx/dist/cli.mjs'),
        'src/scripts/migrate-legacy.ts', `--manifest=${manifestPath}`, '--apply', `--backup-dir=${directory}`],
      { cwd: process.cwd(), env: { ...Object.fromEntries(Object.entries(process.env)
        .filter(([key]) => key.toLowerCase() !== 'onedrive')), OneDrive: directory }, encoding: 'utf8', timeout: 30000 });
      expect(synced.status).toBe(1);
      expect((await db.doc(paths.session).get()).data()?.patientId).toBeUndefined();
      expect((await readdir(directory)).filter(name => name.startsWith('pulsolink-'))).toHaveLength(0);
      if (process.platform === 'win32') {
        // Sin icacls no se permite guardar un respaldo con ACL heredadas.
        const noAcl = spawnSync(process.execPath, [resolve('../../node_modules/tsx/dist/cli.mjs'),
          'src/scripts/migrate-legacy.ts', `--manifest=${manifestPath}`, '--apply', `--backup-dir=${directory}`],
        { cwd: process.cwd(), env: { ...Object.fromEntries(Object.entries(process.env)
          .filter(([key]) => key.toLowerCase() !== 'path')), Path: directory }, encoding: 'utf8', timeout: 30000 });
        expect(noAcl.status).toBe(1);
        expect((await db.doc(paths.session).get()).data()?.patientId).toBeUndefined();
        expect((await readdir(directory)).filter(name => name.startsWith('pulsolink-'))).toHaveLength(0);
      }
      const applied = run('--apply', `--backup-dir=${directory}`);
      expect(applied.status).toBe(0);
      const backupName = (await readdir(directory)).find((name) => name.startsWith('pulsolink-'))!;
      if (process.platform === 'win32') {
        const acl = spawnSync('icacls', [join(directory, backupName)], { encoding: 'utf8' });
        expect(acl.status).toBe(0);
        expect(acl.stdout).not.toContain('(I)');
      }
      const backup = JSON.parse(await readFile(join(directory, backupName), 'utf8')) as { records: Array<{path: string; data: Record<string, unknown>}> };
      expect(backup.records.find((row) => row.path === paths.session)?.data.patientId).toBeUndefined();
      expect((await db.doc(paths.session).get()).data()?.patientId).toBe(manifest.sessions[0].patientId);
      expect((await db.doc(paths.key).get()).data()?.payloadHash).toBe('original-hash-must-not-change');
      expect(run('--apply', `--backup-dir=${directory}`).status).toBe(0);
    } finally {
      // All entries are files created by this test, in its exclusive temp folder.
      for (const entry of await readdir(directory)) await unlink(join(directory, entry));
      await rmdir(directory);
    }
  }, 60000);
  it('downgrades operator without promotion and resumes an interrupted Auth revocation', async () => {
    const { paths, manifest } = await fixture();
    const adminPath = `users/admin-${randomUUID()}`;
    await db.doc(adminPath).set({ role: 'admin', enabled: true });
    // A simulated identity outage occurs after the atomic role/journal change.
    const auth = { revokeRefreshTokens: vi.fn(async () => { throw new Error('Auth unavailable'); }) };
    await expect(migrateLegacy(db, auth, { ...manifest, migrateOperators: true, sessions: [] }, { apply: true, backup: async () => {} })).rejects.toThrow('Auth unavailable');
    // The interrupted user may be another legacy fixture; rerun must complete all.
    auth.revokeRefreshTokens.mockImplementation(async () => {});
    await migrateLegacy(db, auth, { ...manifest, migrateOperators: true, sessions: [] }, { apply: true, backup: async () => {} });
    expect((await db.doc(paths.user).get()).data()?.role).toBe('viewer');
    expect((await db.doc(adminPath).get()).data()?.role).toBe('admin');
    const pending = await db.collection('migrationRecords').where('revocationPending', '==', true).get();
    expect(pending.empty).toBe(true);
  }, 30000);
});
