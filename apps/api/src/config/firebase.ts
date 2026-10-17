import admin from 'firebase-admin';
import { env } from './env.js';

let initialized = false;
let initError: string | null = null;

function initializeFirebase(): boolean {
  if (initialized) return true;
  if (admin.apps.length > 0) {
    initialized = true;
    return true;
  }

  try {
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

    // Si no se proporcionaron credenciales, se deja pendiente
    initError = 'Credenciales de Firebase Admin SDK no configuradas en el entorno.';
    return false;
  } catch (error) {
    initError = error instanceof Error ? error.message : 'Error desconocido al inicializar Firebase Admin';
    console.warn(`⚠️ [Firebase] Inicialización no completada: ${initError}`);
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
