// Repite la matriz HTTP oficial de Hugo con un presupuesto QA de 5 o 30 s.
// No cambia el timeout del producto, el runner habitual ni la persistencia.
const path = require('node:path');

const localHost = /^(127\.0\.0\.1|localhost):\d+$/;
const projectId = process.env.FIREBASE_PROJECT_ID ?? '';
const api = new URL(process.env.API_BASE_URL ?? 'http://localhost:3001/api/v1');
if (!projectId.startsWith('demo-') || !localHost.test(process.env.FIRESTORE_EMULATOR_HOST ?? '') ||
  !localHost.test(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '') ||
  !['127.0.0.1', 'localhost'].includes(api.hostname) || process.env.QA_ALLOW_WRITES !== 'true') {
  throw new Error('La prueba exige API y ambos emuladores locales en un proyecto demo- desechable.');
}
for (const key of ['DEVICE_ID', 'DEVICE_CREDENTIAL_ID', 'DEVICE_SECRET', 'QA_JOINT_DEVICE_SECRET',
  'QA_ADMIN_EMAIL', 'QA_VIEWER_EMAIL', 'QA_PASSWORD']) {
  if (!process.env[key]) throw new Error(`Falta ${key} para la matriz de QA; no se imprimen credenciales.`);
}

const budget = Number(process.env.QA_CONCURRENCY_TIMEOUT_MS ?? '5000');
if (![5000, 30000].includes(budget)) throw new Error('Presupuesto QA permitido: 5000 o 30000 ms.');

const root = path.resolve(__dirname, '../..');
const joint = require(path.join(root, 'tools/device-simulator/dist/qa-joint.js'));
joint.JOINT_CONCURRENCY_TIMEOUT_MS = budget;
require(path.join(root, 'tools/device-simulator/dist/qa.js'));
