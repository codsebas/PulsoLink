import admin from 'firebase-admin';
import { env } from './env.js';

let initialized = false;
let initError: string | null = null;

function initializeFirebase(): boolean {
  if (initialized) return true;
  if (admin.apps.some((app) => app?.name === '[DEFAULT]')) {
    initialized = true;
    return true;
  }

  try {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      if (env.NODE_ENV === 'production' || !env.FIREBASE_PROJECT_ID) {
        throw new Error('El emulador exige un proyecto explícito y un entorno no productivo.');
      }
      admin.initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
      initialized = true;
      initError = null;
      return true;
    }

    if (env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: env.FIREBASE_PROJECT_ID,
      });
      initialized = true;
      return true;
    }

    if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
      initialized = true;
      return true;
    }

    // Application Default Credentials also support managed Google runtimes.
    if (env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({ projectId: env.FIREBASE_PROJECT_ID, credential: admin.credential.applicationDefault() });
      initialized = true;
      initError = null;
      return true;
    }

    // Si no se proporcionaron credenciales, se deja pendiente
    initError = 'Credenciales de Firebase Admin SDK no configuradas en el entorno.';
    return false;
  } catch {
    initError = 'No se pudo inicializar Firebase Admin. Revise la configuración del servidor.';
    return false;
  }
}

// Intentar inicialización no bloqueante
initializeFirebase();

export function isFirebaseConfigured(): boolean {
  return initialized;
}

export function getFirebaseStatus(): { configured: boolean; mode: string; error?: string } {
  if (initialized) {
    return {
      configured: true,
      mode: process.env.FIRESTORE_EMULATOR_HOST ? 'emulator' : 'cloud',
    };
  }
  return {
    configured: false,
    mode: 'uninitialized',
    error: initError || undefined,
  };
}

export function getDb(): admin.firestore.Firestore {
  if (!initialized && !initializeFirebase()) {
    throw new Error(
      `FIREBASE_NOT_CONFIGURED: No se puede acceder a Cloud Firestore. ${initError || 'Defina credenciales en apps/api/.env'}`
    );
  }
  return admin.firestore();
}

export function getAuth(): admin.auth.Auth {
  if (!initialized && !initializeFirebase()) {
    throw new Error(
      `FIREBASE_NOT_CONFIGURED: No se puede acceder a Firebase Authentication. ${initError || 'Defina credenciales en apps/api/.env'}`
    );
  }
  return admin.auth();
}
