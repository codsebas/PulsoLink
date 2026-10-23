const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const root = process.cwd();
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const out = path.join(root, '.cache/pulsoai-browser');
fs.mkdirSync(out, { recursive: true });
let server, browser, stopWorker, page;
let stage = 'preflight', apiCalls = 0;
async function main() {
  assert.equal(process.versions.node.split('.')[0], '24');
  assert(process.env.FIREBASE_PROJECT_ID?.startsWith('demo-'));
  assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ''));
  assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || ''));
  const privateEnv = requireApi('dotenv').parse(fs.readFileSync(process.env.PULSOAI_QA_ENV_FILE || path.join(root, 'apps/api/.env')));
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
  stage = 'emulator fixtures';
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
  // sendFile rejects dot-prefixed absolute path segments (e.g. .codex worktrees).
  // Serve a temporary copy for QA rather than weakening production dotfile rules.
  const publicDist = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pulsoai-qa-web-'));
  fs.cpSync(path.join(root, 'apps/web/dist'), publicDist, { recursive: true });
  const application = createApp({ webDistPath: publicDist });
  server = await new Promise(resolve => { const s = application.listen(18001, '127.0.0.1', () => resolve(s)); });
  const { chromium } = require(process.env.PULSOLINK_PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  const origin = 'http://127.0.0.1:18001';
  stage = 'browser login';
  await page.goto(origin + '/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL(url => !url.pathname.includes('login'));
  stage = 'active session browser';
  await page.goto(origin + '/sessions/' + session.sessionId);
  await page.getByText('Frecuencia Cardíaca', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Resumen generado por PulsoAI' }).count(), 0);
  const csrf = (await (await page.request.get(origin + '/api/v1/auth/csrf')).json()).data.csrfToken;
  const finished = await page.request.post(origin + '/api/v1/sessions/' + session.sessionId + '/finish', {
    headers: { Origin: origin, 'X-CSRF-Token': csrf }, data: {},
  });
  assert.equal(finished.status(), 200);
  stage = 'pending summary browser';
  await page.getByText('PulsoAI está preparando el resumen de la sesión.', { exact: true }).waitFor();
  let usage, returnedModel, finishReason;
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
  stage = 'real Groq generation';
  await worker.tick();
  const persisted = await jobs.get(session.sessionId);
  assert.equal(persisted.status, 'ready', 'provider result must pass complete fact validation');
  stage = 'ready summary browser';
  await page.getByRole('heading', { name: 'Resumen generado por PulsoAI', exact: true }).waitFor();
  assert.equal(apiCalls, 1);
  const block = page.getByRole('region', { name: 'Resumen generado por PulsoAI', exact: true });
  await block.getByText(/origen simulado/).first().waitFor();
  assert(persisted.text.includes('77 bpm'));
  assert(persisted.text.includes('97 %'));
  assert(persisted.text.includes('32 °C'));
  assert(/no (?:está )?validado para uso clínico/.test(persisted.text));
  const oldTime = persisted.generatedAt;
  await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
  await page.reload();
  stage = 'reload browser';
  await page.getByRole('heading', { name: 'Resumen generado por PulsoAI' }).waitFor();
  assert.equal((await jobs.get(session.sessionId)).generatedAt, oldTime);
  assert.equal(apiCalls, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  // Real HTTP, unchanged 5 s budget. No worker ticks here, hence no more Groq calls.
  const secret = randomBytes(32).toString('base64url');
  const credentialId = 'qa-concurrency-' + randomUUID();
  await db.collection('deviceCredentials').doc(credentialId).set({ deviceId: device.deviceId, enabled: true,
    revokedAt: null, createdAt: new Date().toISOString(), secretHash: createHash('sha256').update(secret).digest('hex') });
  const concurrencyRounds = [];
  stage = 'six HTTP concurrency rounds';
  const mutation = async (route, data) => page.request.post(origin + '/api/v1' + route, {
    headers: { Origin: origin, 'X-CSRF-Token': csrf }, data, timeout: 5000,
  });
  for (const order of ['finish-first', 'samples-first']) for (let round = 0; round < 3; round++) {
    const createReply = await mutation('/sessions', { assignmentId: assignment.id });
    assert.equal(createReply.status(), 201);
    const id = (await createReply.json()).data.id;
    assert.equal((await mutation('/sessions/' + id + '/start', {})).status(), 200);
    const boot = randomUUID();
    const payloads = Array.from({ length: 5 }, (_, sequence) => ({ deviceId: device.deviceId, sessionId: id, bootId: boot,
      sequence, capturedAt: null, measurements: { heartRate: { value: 78, unit: 'bpm', status: 'valid' },
        spo2: { value: 97, unit: '%', status: 'valid' }, skinTemperature: { value: 31, unit: 'C', status: 'valid' } } }));
    const begin = Date.now();
    const finish = () => mutation('/sessions/' + id + '/finish', {});
    const sample = payload => page.request.post(origin + '/api/v1/device/measurements', {
      headers: { Authorization: 'Bearer ' + credentialId + '.' + secret }, data: payload, timeout: 5000,
    });
    const finishing = order === 'finish-first' ? finish() : null;
    const incoming = payloads.map(sample);
    const replies = await Promise.all([finishing || finish(), ...incoming]);
    const elapsedMs = Date.now() - begin;
    assert(elapsedMs < 5000);
    assert.equal(replies[0].status(), 200);
    for (const reply of replies.slice(1)) {
      assert([201, 409].includes(reply.status()));
      if (reply.status() === 409) assert.equal((await reply.json()).error.code, 'SESSION_NOT_ACTIVE');
    }
    const accepted = replies.slice(1).filter(reply => reply.status() === 201).length;
    const history = (await measurements.list(id)).data;
    assert.equal(history.length, accepted);
    const end = await sessions.getById(id);
    assert(history.every(reading => reading.receivedAt <= end.finishedAt));
    assert.equal((await jobs.get(id)).status, 'pending');
    // Repetition does not create another job or reset closure.
    assert.equal((await mutation('/sessions/' + id + '/finish', {})).status(), 200);
    assert.equal((await sessions.getById(id)).finishedAt, end.finishedAt);
    concurrencyRounds.push({ order, round: round + 1, elapsedMs, accepted, history: history.length });
  }
  assert.equal(apiCalls, 1);
  // Exercise the two opt-in web HTTP integration tests with a real authenticated
  // emulator session and >100 readings. Never put the cookie in command arguments.
  const integrationCreate = await mutation('/sessions', { assignmentId: assignment.id });
  stage = 'web HTTP integration';
  assert.equal(integrationCreate.status(), 201);
  const integrationSession = (await integrationCreate.json()).data.id;
  assert.equal((await mutation('/sessions/' + integrationSession + '/start', {})).status(), 200);
  const integrationBoot = randomUUID();
  for (let i = 0; i < 105; i++) await measurements.ingest(device.deviceId, {
    deviceId: device.deviceId, sessionId: integrationSession, bootId: integrationBoot, sequence: i, capturedAt: null,
    measurements: { heartRate: { value: i === 104 ? null : 78, unit: 'bpm', status: i === 104 ? 'no_contact' : 'valid' },
      spo2: { value: i === 104 ? null : 97, unit: '%', status: i === 104 ? 'no_contact' : 'valid' },
      skinTemperature: { value: 31, unit: 'C', status: 'valid' } },
  });
  const cookieHeader = (await context.cookies(origin)).map(cookie => cookie.name + '=' + cookie.value).join('; ');
  const integrationExit = await new Promise((resolve, reject) => {
    const child = require('node:child_process').spawn(process.execPath,
      [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', 'test/monitoring-api.integration.test.ts',
        '--reporter=json', '--outputFile=' + path.join(out, 'web-http-tests.json')], {
        cwd: path.join(root, 'apps/web'), windowsHide: true,
        env: { ...process.env, PULSOLINK_API_URL: origin, PULSOLINK_SESSION_COOKIE: cookieHeader, PULSOLINK_PATIENT_ID: patient.id },
        stdio: 'ignore',
      });
    child.once('error', () => reject(new Error('Web integration process failed.')));
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Web integration timeout.')); }, 90000);
    child.once('close', code => { clearTimeout(timeout); resolve(code); });
  });
  const webHttpTests = JSON.parse(fs.readFileSync(path.join(out, 'web-http-tests.json'), 'utf8'));
  if (integrationExit !== 0) console.error(JSON.stringify({ stage: 'web-http', failedTests:
    webHttpTests.testResults.flatMap(file => file.assertionResults.filter(test => test.status !== 'passed').map(test => test.fullName)) }));
  assert.equal(integrationExit, 0, 'two web integration tests must pass against the real local API');
  assert.equal(webHttpTests.numPassedTests, 2);
  assert.equal(webHttpTests.numPendingTests, 0);
  assert.equal((await mutation('/sessions/' + integrationSession + '/finish', {})).status(), 200);
  const result = {
    status: 'PASS', generatedAt: new Date().toISOString(), project: process.env.FIREBASE_PROJECT_ID,
    environment: 'Auth/Firestore Standard emulators + real Groq API + Edge headless + compiled SPA',
    sessionId: session.sessionId, apiCalls, returnedModel, finishReason, usage,
    stats: persisted.stats, text: persisted.text, overflowAt390px: overflow, concurrencyRounds, webHttpIntegrationTests: 2,
    checks: ['real-emulator-login', 'active-session-no-summary', 'finish-HTTP-200', 'durable-pending',
      'real-Groq-strict-plan', 'complete-facts', 'persisted-ready', 'browser-title-and-text', 'reload-reuses-result'],
  };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, apiCalls, returnedModel, usage, overflowAt390px: overflow, concurrencyRounds, output: out }));
}
main().catch(async error => {
  const failure = { status: 'FAIL', stage, apiCalls, category: error?.code || error?.name || 'ERROR',
    assertion: error?.name === 'AssertionError' ? error.message.slice(0, 160) : undefined };
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify(failure, null, 2));
  if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
}).finally(async () => {
  stopWorker?.();
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  try { await requireApi('firebase-admin/app').deleteApp(requireApi('firebase-admin/app').getApp()); } catch {}
});
