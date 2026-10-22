const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const root = process.cwd();
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const out = path.join(root, '.cache/pulsoai-browser');
fs.mkdirSync(out, { recursive: true });
let server, browser, stopWorker;
async function main() {
  assert.equal(process.versions.node.split('.')[0], '24');
  assert(process.env.FIREBASE_PROJECT_ID?.startsWith('demo-'));
  assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ''));
  assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || ''));
  const privateEnv = requireApi('dotenv').parse(fs.readFileSync(path.join(root, 'apps/api/.env')));
  assert.equal(process.env.PULSOAI_QA_ALLOW_REAL_GROQ, 'true', 'Explicit opt-in required for one real Groq request.');
  assert(privateEnv.GROQ_API_KEY);
  Object.assign(process.env, {
    NODE_ENV: 'test', CORS_ORIGIN: 'http://127.0.0.1:18001', COOKIE_SECURE: 'false',
    FIREBASE_WEB_API_KEY: 'demo-key', CSRF_SECRET: randomBytes(32).toString('hex'),
    SESSION_SUMMARY_ENABLED: 'true', GROQ_MODEL: 'openai/gpt-oss-20b',
  });
  const moduleAt = p => require(path.join(root, 'apps/api/dist', p));
  const { getDb, getAuth } = moduleAt('config/firebase.js');
  const { createApp } = moduleAt('app.js');
  const { SummaryWorker } = moduleAt('modules/pulsoai/pulsoai.service.js');
  const { SummaryRepository } = moduleAt('modules/pulsoai/pulsoai.repository.js');
  const { generateSummary } = moduleAt('modules/pulsoai/pulsoai.provider.js');
  const { SessionsRepository } = moduleAt('modules/sessions/sessions.repository.js');
  const { MeasurementsRepository } = moduleAt('modules/measurements/measurements.repository.js');
  const { PatientsRepository } = moduleAt('modules/patients/patients.repository.js');
  const { DevicesRepository } = moduleAt('modules/devices/devices.repository.js');
  const { AssignmentsRepository } = moduleAt('modules/assignments/assignments.repository.js');
  const db = getDb(), auth = getAuth();
  const uid = 'pulsoai-admin-' + randomUUID();
  const password = randomBytes(24).toString('base64url');
  const email = uid + '@example.invalid';
  await auth.createUser({ uid, email, password });
  await db.collection('users').doc(uid).set({ displayName: 'Admin ficticio PulsoAI', role: 'admin', enabled: true, createdAt: new Date().toISOString() });
  const patient = await new PatientsRepository().create({ code: 'PULSOAI-QA', displayName: 'Paciente ficticio PulsoAI' }, uid);
  const device = await new DevicesRepository().create({ code: 'SIM-PULSOAI', source: 'simulated' }, uid);
  const assignment = await new AssignmentsRepository().create({ patientId: patient.id, deviceId: device.deviceId }, uid);
  const sessions = new SessionsRepository(), measurements = new MeasurementsRepository(), jobs = new SummaryRepository();
  const session = await sessions.createForAssignment(assignment.id, uid);
  await sessions.start(session.sessionId, uid);
  const bootId = randomUUID();
  for (let i = 0; i < 3; i++) await measurements.ingest(device.deviceId, {
    deviceId: device.deviceId, sessionId: session.sessionId, bootId, sequence: i, capturedAt: null,
    measurements: {
      heartRate: { value: i === 2 ? null : 76 + i * 2, unit: 'bpm', status: i === 2 ? 'no_contact' : 'valid' },
      spo2: { value: i === 2 ? null : 97, unit: '%', status: i === 2 ? 'no_contact' : 'valid' },
      skinTemperature: { value: 31 + i, unit: 'C', status: 'valid' },
    },
  });
  const application = createApp({ webDistPath: path.join(root, 'apps/web/dist') });
  server = await new Promise(resolve => { const s = application.listen(18001, '127.0.0.1', () => resolve(s)); });
  const { chromium } = require(process.env.PULSOLINK_PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const origin = 'http://127.0.0.1:18001';
  await page.goto(origin + '/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL(url => !url.pathname.includes('login'));
  await page.goto(origin + '/sessions/' + session.sessionId);
  await page.getByText('Frecuencia Cardíaca', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Resumen generado por PulsoAI' }).count(), 0);
  const csrf = (await (await page.request.get(origin + '/api/v1/auth/csrf')).json()).data.csrfToken;
  const finished = await page.request.post(origin + '/api/v1/sessions/' + session.sessionId + '/finish', {
    headers: { Origin: origin, 'X-CSRF-Token': csrf }, data: {},
  });
  assert.equal(finished.status(), 200);
  await page.getByText('PulsoAI está preparando el resumen de la sesión.', { exact: true }).waitFor();
  let apiCalls = 0, usage, returnedModel, finishReason;
  const worker = new SummaryWorker({
    jobs, sessions, measurements,
    config: () => ({ enabled: true, key: privateEnv.GROQ_API_KEY, model: 'openai/gpt-oss-20b' }),
    generate: (facts, config) => generateSummary(facts, config, async (...args) => {
      apiCalls++;
      const response = await fetch(...args);
      if (response.ok) {
        const metadata = await response.clone().json();
        usage = metadata.usage; returnedModel = metadata.model; finishReason = metadata.choices?.[0]?.finish_reason;
      }
      return response;
    }),
  });
  await worker.tick();
  const persisted = await jobs.get(session.sessionId);
  assert.equal(persisted.status, 'ready', 'provider result must pass complete fact validation');
  await page.getByRole('heading', { name: 'Resumen generado por PulsoAI', exact: true }).waitFor();
  assert.equal(apiCalls, 1);
  const block = page.getByRole('region', { name: 'Resumen generado por PulsoAI', exact: true });
  await block.getByText(/origen simulado/).first().waitFor();
  assert(persisted.text.includes('77 bpm'));
  assert(persisted.text.includes('97 %'));
  assert(persisted.text.includes('32 °C'));
  assert(persisted.text.includes('no validado para uso clínico'));
  const oldTime = persisted.generatedAt;
  await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
  await page.reload();
  await page.getByRole('heading', { name: 'Resumen generado por PulsoAI' }).waitFor();
  assert.equal((await jobs.get(session.sessionId)).generatedAt, oldTime);
  assert.equal(apiCalls, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const result = {
    status: 'PASS', generatedAt: new Date().toISOString(), project: process.env.FIREBASE_PROJECT_ID,
    environment: 'Auth/Firestore Standard emulators + real Groq API + Edge headless + compiled SPA',
    sessionId: session.sessionId, apiCalls, returnedModel, finishReason, usage,
    stats: persisted.stats, text: persisted.text, overflowAt390px: overflow,
    checks: ['real-emulator-login', 'active-session-no-summary', 'finish-HTTP-200', 'durable-pending',
      'real-Groq-strict-plan', 'complete-facts', 'persisted-ready', 'browser-title-and-text', 'reload-reuses-result'],
  };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, apiCalls, returnedModel, usage, overflowAt390px: overflow, output: out }));
}
main().catch(error => {
  console.error(JSON.stringify({ status: 'FAIL', category: error?.code || error?.name || 'ERROR', assertion: error?.name === 'AssertionError' ? error.message.slice(0, 160) : undefined }));
  process.exitCode = 1;
}).finally(async () => {
  stopWorker?.();
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  try { await requireApi('firebase-admin/app').deleteApp(requireApi('firebase-admin/app').getApp()); } catch {}
});


