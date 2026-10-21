/** Local disposable fixtures for #32/#44. Simulator itself uses HTTP only. */
import { getAuth, getDb } from '../config/firebase.js';
import { assertDisposableEmulators, seedEmulators } from './emulator-fixtures.js';
import { seedPatientDataset } from './patient-fixtures.js';
import { seedMonitoringDataset } from './monitoring-fixtures.js';
import { provisionDemo } from './demo-provisioning.js';

async function main() {
  assertDisposableEmulators();
  const db = getDb(); const auth = getAuth();
  const secret = process.env.DEMO_DEVICE_SECRET ?? '';
  await seedEmulators(db, auth, { password: process.env.DEMO_FIXTURE_PASSWORD ?? '', secret });
  await seedPatientDataset(db);
  await seedMonitoringDataset(db);
  await provisionDemo(db, auth, {
    profiles: [{ uid: 'demo-admin', displayName: 'Administración demo', role: 'admin' }],
    deviceId: 'demo-device-2', credentialId: 'demo-credential-2', secret,
  });
  console.log('Fixtures QA preparados: demo-device-2 / demo-session-2; pacientes A/B e historial de 240 lecturas.');
}
main().catch(() => { console.error('Fixture QA no preparado. Verificar emuladores demo-, variables y conflictos sin sobrescribir datos.'); process.exitCode = 1; });
