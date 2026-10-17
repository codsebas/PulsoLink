import { getAuth, getDb } from '../config/firebase.js';
import { demoConfigSchema, provisionDemo } from './demo-provisioning.js';

async function main() {
  let profiles: unknown;
  try { profiles = JSON.parse(process.env.DEMO_PROFILES_JSON ?? ''); }
  catch { throw new Error('DEMO_PROFILES_JSON debe contener los UID, nombres y roles acordados con Auth.'); }
  const parsed = demoConfigSchema.safeParse({ profiles, deviceId: process.env.DEMO_DEVICE_ID,
    credentialId: process.env.DEMO_CREDENTIAL_ID, secret: process.env.DEMO_DEVICE_SECRET });
  if (!parsed.success) throw new Error('Configuración de demostración inválida. Consulte firebase/README.md.');
  if (!process.env.FIREBASE_PROJECT_ID) throw new Error('Se requiere FIREBASE_PROJECT_ID explícito.');
  // Never accidentally mix local Firestore profiles with real Auth identities.
  if (Boolean(process.env.FIRESTORE_EMULATOR_HOST) !== Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new Error('Configure ambos emuladores o ninguno.');
  }
  const result = await provisionDemo(getDb(), getAuth(), parsed.data);
  console.log('Aprovisionamiento completado:', result);
}

main().catch(() => {
  // SDK and validation errors can include inputs or credential details. Do not log them.
  console.error('Aprovisionamiento no completado. Revise proyecto, identidades Auth, configuración y posibles conflictos. No se rotan credenciales ni se sobrescriben documentos existentes.');
  process.exitCode = 1;
});
