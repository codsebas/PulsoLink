/**
 * Aprovisionamiento idempotente de identidades de Firebase Authentication.
 *
 *   npx tsx src/scripts/provision-auth-users.ts
 *
 * Variables de entorno:
 *   FIREBASE_PROJECT_ID, PROVISION_TARGET_PROJECT (mismo proyecto explícito)
 *   PROVISION_ADMIN_EMAIL, PROVISION_ADMIN_PASSWORD, PROVISION_ADMIN_NAME
 *   PROVISION_VIEWER_EMAIL, PROVISION_VIEWER_PASSWORD, PROVISION_VIEWER_NAME
 *   PROVISION_OPERATOR_* sigue como alias legado de viewer; no cambia roles.
 *   Opcionales: FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST
 *
 * Este script SOLO crea identidades ausentes en Firebase Authentication. NO
 * cambia contraseñas, nombres ni estado de identidades ya existentes. NO
 * escribe en Firestore: los documentos `users/{uid}` los provisiona el script
 * `provision-demo.ts` (@gioore) a partir de `DEMO_PROFILES_JSON`.
 *
 * Orden de aprovisionamiento (ver docs/auth.md):
 *   1. provision-auth-users.ts  → identidades (este script)
 *   2. provision-demo.ts        → perfiles users/{uid} y dispositivo
 *
 * Las contraseñas solo se envían a Firebase Authentication. Nunca se guardan en
 * Firestore, ni en `.env`, ni en los registros de este script. Al finalizar se
 * imprime una línea `DEMO_PROFILES_JSON=...` con los UID reales (sin
 * contraseñas) para encadenarla con el script de @gioore.
 */
import { getAuth } from '../config/firebase.js';
import { z } from 'zod';

interface Target {
  label: string;
  emailVariable: string;
  passwordVariable: string;
  nameVariable: string;
  role: 'admin' | 'viewer';
}

interface ProvisionedProfile {
  uid: string;
  displayName: string;
  role: 'admin' | 'viewer';
}

const TARGETS: Target[] = [
  {
    label: 'administrador',
    emailVariable: 'PROVISION_ADMIN_EMAIL',
    passwordVariable: 'PROVISION_ADMIN_PASSWORD',
    nameVariable: 'PROVISION_ADMIN_NAME',
    role: 'admin',
  },
  {
    label: 'consulta',
    emailVariable: 'PROVISION_VIEWER_EMAIL',
    passwordVariable: 'PROVISION_VIEWER_PASSWORD',
    nameVariable: 'PROVISION_VIEWER_NAME',
    role: 'viewer',
  },
];

const MINIMUM_PASSWORD_LENGTH = 10;

function getRequired(variable: string): string {
  const primary = process.env[variable]?.trim();
  const legacy = variable.startsWith('PROVISION_VIEWER_')
    ? process.env[variable.replace('PROVISION_VIEWER_', 'PROVISION_OPERATOR_')]?.trim() : undefined;
  if (primary && legacy && primary !== legacy) throw new Error('Alias de consulta incompatibles.');
  const value = primary || legacy;
  if (!value) {
    throw new Error(`Falta la variable de entorno ${variable}.`);
  }
  return value;
}

function assertPassword(variable: string, value: string): void {
  if (value.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(`La variable ${variable} debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`);
  }
}

interface ResolvedTarget extends Target {
  email: string;
  password: string;
  displayName: string;
}

function resolveTargets(): ResolvedTarget[] {
  const targets = TARGETS.map((target) => {
    const email = z.string().email().parse(getRequired(target.emailVariable)).toLowerCase();
    const password = getRequired(target.passwordVariable);
    assertPassword(target.passwordVariable, password);
    const displayName = z.string().min(1).max(100).parse(getRequired(target.nameVariable));
    return { ...target, email, password, displayName };
  });
  if (targets[0].email === targets[1].email) throw new Error('Admin y viewer deben ser identidades distintas.');
  return targets;
}

type Auth = ReturnType<typeof getAuth>;

async function findUserOrNull(auth: Auth, email: string) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

async function provisionIdentity(
  auth: Auth,
  target: ResolvedTarget,
): Promise<{ uid: string; created: boolean }> {
  const existing = await findUserOrNull(auth, target.email);
  if (existing) {
    if (existing.disabled) throw new Error('Identidad existente deshabilitada; requiere revisión administrativa.');
    return { uid: existing.uid, created: false };
  }

  const user = await auth.createUser({
    email: target.email,
    password: target.password,
    displayName: target.displayName,
    disabled: false,
  });
  return { uid: user.uid, created: true };
}

async function main(): Promise<void> {
  // Proyecto explícito obligatorio, igual que en provision-demo.ts.
  process.env.FIREBASE_PROJECT_ID = getRequired('FIREBASE_PROJECT_ID');
  if (getRequired('PROVISION_TARGET_PROJECT') !== process.env.FIREBASE_PROJECT_ID) {
    throw new Error('El proyecto de destino no coincide.');
  }

  // Evita mezclar identidades reales con perfiles del emulador local.
  if (
    Boolean(process.env.FIRESTORE_EMULATOR_HOST) !==
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)
  ) {
    throw new Error('Configure ambos emuladores o ninguno.');
  }

  const targets = resolveTargets();
  const auth = getAuth();
  // Detectar bloqueos conocidos en ambas identidades antes de la primera alta.
  const identities = await Promise.all(targets.map(target => findUserOrNull(auth, target.email)));
  if (identities.some(identity => identity?.disabled)) throw new Error('Hay una identidad deshabilitada.');
  const profiles: ProvisionedProfile[] = [];

  for (const target of targets) {
    const { uid, created } = await provisionIdentity(auth, target);
    profiles.push({ uid, displayName: target.displayName, role: target.role });
    const action = created ? 'creado' : 'conservado';
    console.log(`${target.label}: uid=${uid} role=${target.role} ${action}`);
  }

  console.log('');
  console.log('Identidades listas. Perfiles para provision-demo.ts:');
  console.log(`DEMO_PROFILES_JSON=${JSON.stringify(profiles)}`);
}

main().catch(() => {
  // Los errores del SDK pueden incluir datos de entrada o credenciales: nunca
  // se imprimen. Solo se indica que el aprovisionamiento no finalizó.
  console.error(
    'Aprovisionamiento de identidades no completado. Revise FIREBASE_PROJECT_ID, las variables PROVISION_* y la configuración de emuladores.',
  );
  process.exitCode = 1;
});
