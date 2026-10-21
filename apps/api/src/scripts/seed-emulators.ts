import { getAuth, getDb } from '../config/firebase.js';
import { assertDisposableEmulators, seedEmulators } from './emulator-fixtures.js';
import { seedMonitoringDataset } from './monitoring-fixtures.js';
import { seedPatientDataset } from './patient-fixtures.js';

async function main() {
  assertDisposableEmulators();
  const result = await seedEmulators(getDb(), getAuth(), {
    password: process.env.DEMO_FIXTURE_PASSWORD ?? '', secret: process.env.DEMO_DEVICE_SECRET ?? '',
  });
  console.log('Datos de emuladores preparados:', result);
  console.log('Historial simulado:', await seedPatientDataset(getDb()));
  console.log('Historial de paginación:', await seedMonitoringDataset(getDb()));
}
main().catch(() => {
  console.error('No se prepararon los datos. Revise los hosts locales, proyecto demo-, secretos y conflictos de identidades/perfiles. Reintente con los mismos valores; no se sobrescriben cuentas ni se rotan credenciales.');
  process.exitCode = 1;
});
