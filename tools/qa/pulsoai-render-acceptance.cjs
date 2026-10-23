// HTTPS acceptance against the named test project. Secrets stay in memory.
// Only synthetic fixtures created by this run are mutated; history is retained.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const origin = 'https://pulsolink-api.onrender.com';
const project = 'pulsolink-pruebas-2026-7c8a31';
const out = path.join(root, '.cache/pulsoai-render');
const report = { status: 'FAIL', generatedAt: new Date().toISOString(), origin, project,
  checks: [], sessions: {}, cleanup: [], environment: 'Render HTTPS + Firebase cloud + real Groq + Edge' };
let browser, context, db, csrf, stage = 'preflight', patientId, deviceId, assignmentId, credentialId;
let activeSessionId;
const check = (name, condition) => { report.checks.push({ name, pass: Boolean(condition) }); assert(condition, name); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function api(route, method = 'GET', data, withCsrf = true) {
  const response = await context.request.fetch(origin + '/api/v1' + route, {
    method, data, timeout: 30_000, maxRedirects: 0,
    headers: { Origin: origin, ...(withCsrf && csrf ? { 'X-CSRF-Token': csrf } : {}) },
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}
async function create(route, data) {
  const response = await api(route, 'POST', data);
  check('create ' + route, response.status === 201 && typeof response.body?.data?.id === 'string');
  return response.body.data.id;
}
async function waitForSummary(id) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const response = await api(`/sessions/${id}/summary`);
    check('summary GET 200', response.status === 200);
    if (!['pending', 'generating'].includes(response.body.data.status)) return response.body.data;
    await pause(2000);
  }
  throw new Error('SUMMARY_WAIT_TIMEOUT');
}
async function main() {
  assert.equal(process.versions.node.split('.')[0], '24');
  const env = { ...require('dotenv').parse(fs.readFileSync(path.join(root, 'apps/api/.env'))), ...process.env };
  assert.equal(env.FIREBASE_PROJECT_ID, project);
  assert(!env.FIRESTORE_EMULATOR_HOST && !env.FIREBASE_AUTH_EMULATOR_HOST);
  assert.equal(env.PULSOAI_RENDER_ALLOW_WRITES, 'true', 'Explicit opt-in for synthetic cloud fixtures required');
  Object.assign(process.env, env);
  const accountFile = fs.realpathSync(env.PULSOAI_RENDER_ACCOUNTS_FILE || path.join(env.LOCALAPPDATA || os.homedir(),
    'PulsoLink', project, 'cuenta-admin-render.json'));
  for (const forbidden of [root, env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial].filter(Boolean)) {
    const relative = path.relative(path.resolve(forbidden), accountFile);
    assert(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative));
  }
  const accounts = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
  const account = (Array.isArray(accounts) ? accounts : [accounts]).find(a => a.role === 'admin');
  assert(account?.email && account.password);
  if (account.projectId) assert.equal(account.projectId, project);
  const { chromium } = require(env.PULSOLINK_PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  // Certificate validation remains enabled (the Playwright default).
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const health = await api('/health');
  check('public HTTPS health cloud', health.status === 200 && health.body.firebase?.mode === 'cloud');
  csrf = (await api('/auth/csrf')).body.data.csrfToken;
  stage = 'HTTPS admin login';
  const login = await api('/auth/login', 'POST', { email: account.email, password: account.password });
  check('admin login', login.status === 200 && login.body?.data?.role === 'admin');
  csrf = (await api('/auth/csrf')).body.data.csrfToken;
  const cookie = (await context.cookies(origin)).find(c => c.name === 'pulsolink_session');
  check('session cookie Secure HttpOnly SameSite=Lax Path=/', cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.path === '/');
  db = require(path.join(root, 'apps/api/dist/config/firebase.js')).getDb();
  assert.equal(db.projectId, project);
  const actor = await db.collection('users').doc(login.body.data.id).get();
  check('same cloud project and enabled admin', actor.exists && actor.data().role === 'admin' && actor.data().enabled === true);
  const suffix = randomUUID().slice(0, 10);
  stage = 'synthetic fixture';
  patientId = await create('/patients', { code: 'AI-QA-' + suffix, displayName: 'Paciente ficticio PulsoAI HTTPS' });
  deviceId = await create('/devices', { code: 'AI-SIM-' + suffix, source: 'simulated' });
  check('independent fixture readback', (await db.collection('patients').doc(patientId).get()).exists);
  credentialId = 'pulsoai-qa-' + randomUUID();
  const secret = randomBytes(32).toString('base64url');
  await db.collection('deviceCredentials').doc(credentialId).create({ deviceId, enabled: true, revokedAt: null,
    createdAt: new Date().toISOString(), secretHash: createHash('sha256').update(secret).digest('hex') });
  assignmentId = await create('/assignments', { patientId, deviceId });
  const noContact = { heartRate: { value: null, status: 'no_contact', unit: 'bpm' },
    spo2: { value: null, status: 'no_contact', unit: '%' }, skinTemperature: { value: null, status: 'unavailable', unit: 'C' } };
  const valid = (pulse, temperature) => ({ heartRate: { value: pulse, status: 'valid', unit: 'bpm' },
    spo2: { value: 97, status: 'valid', unit: '%' }, skinTemperature: { value: temperature, status: 'valid', unit: 'C' } });
  const cases = [
    { name: 'empty', rows: [], expected: 'insufficient_data' },
    { name: 'no_contact', rows: [noContact], expected: 'insufficient_data' },
    { name: 'mixed', rows: [valid(76, 30), valid(78, 31), { ...noContact, skinTemperature: { value: 32, status: 'valid', unit: 'C' } }], expected: 'ready' },
  ];
  for (const scenario of cases) {
    stage = scenario.name;
    const id = activeSessionId = await create('/sessions', { assignmentId });
    report.sessions[scenario.name] = { id, expected: scenario.expected };
    check('start ' + scenario.name, (await api(`/sessions/${id}/start`, 'POST', {})).status === 200);
    check('active session does not request summary', (await api(`/sessions/${id}/summary`)).body.data.status === 'not_requested');
    check('active session has no job', !(await db.collection('sessionSummaries').doc(id).get()).exists);
    const bootId = randomUUID();
    for (let sequence = 0; sequence < scenario.rows.length; sequence++) {
      const response = await context.request.post(origin + '/api/v1/device/measurements', { maxRedirects: 0, timeout: 30_000,
        headers: { Authorization: `Bearer ${credentialId}.${secret}` },
        data: { deviceId, sessionId: id, bootId, sequence, capturedAt: null, measurements: scenario.rows[sequence] } });
      check('official HTTPS ingestion ' + scenario.name, response.status() === 201);
    }
    const finished = await api(`/sessions/${id}/finish`, 'POST', {});
    check('finish succeeds ' + scenario.name, finished.status === 200);
    activeSessionId = null;
    const summary = await waitForSummary(id);
    report.sessions[scenario.name].summary = summary;
    check('terminal state ' + scenario.name, summary.status === scenario.expected);
    check('all samples and simulated source ' + scenario.name, summary.stats.total === scenario.rows.length && summary.stats.source === 'simulated');
    const persisted = (await db.collection('sessionSummaries').doc(id).get()).data();
    check('independent summary persistence ' + scenario.name, persisted.text === summary.text && isDeepStrictEqual(persisted.stats, summary.stats));
    report.sessions[scenario.name].metadata = { attempts: persisted.attempts, provider: persisted.provider, model: persisted.model,
      promptVersion: persisted.promptVersion, inputHash: persisted.inputHash };
    if (scenario.expected === 'insufficient_data') {
      check('null statistics without fictitious zero ' + scenario.name, summary.text === null &&
        Object.values(summary.stats.metrics).every(m => m.mean === null && m.min === null && m.max === null && m.validCount === 0));
    } else {
      const m = summary.stats.metrics;
      check('exact mixed statistics', m.heartRate.mean === 77 && m.heartRate.validCount === 2 && m.heartRate.quality.no_contact === 1 &&
        m.spo2.mean === 97 && m.skinTemperature.mean === 31 && m.skinTemperature.validCount === 3);
      const { summaryFacts } = require(path.join(root, 'apps/api/dist/modules/pulsoai/pulsoai.stats.js'));
      const facts = summaryFacts(summary.stats);
      const paragraphs = summary.text.split('\n\n');
      check('complete approved facts without invented prose', paragraphs.length === facts.length && facts.every(f => paragraphs.filter(p => f.wordings.includes(p)).length === 1));
      check('Groq model and one successful job attempt', persisted.provider === 'groq' && persisted.model === 'openai/gpt-oss-20b' && persisted.attempts === 1);
      check('retry requires CSRF', (await api(`/sessions/${id}/summary/retry`, 'POST', {}, false)).status === 403);
      check('ready retry idempotent', (await api(`/sessions/${id}/summary/retry`, 'POST', {})).status === 202);
      check('finish repeated idempotent', (await api(`/sessions/${id}/finish`, 'POST', {})).body.data.finishedAt === finished.body.data.finishedAt);
      const anonymous = await browser.newContext();
      const unauth = await anonymous.request.get(origin + `/api/v1/sessions/${id}/summary`, { maxRedirects: 0 });
      check('summary requires authentication', unauth.status() === 401);
      await anonymous.close();
    }
    const page = await context.newPage();
    await page.goto(origin + '/sessions/' + id);
    const region = page.getByRole('region', { name: scenario.expected === 'ready' ? 'Resumen generado por PulsoAI' : 'PulsoAI — resumen de sesión', exact: true });
    await region.waitFor({ timeout: 30_000 });
    if (scenario.expected === 'ready') await region.getByText(/origen simulado/).first().waitFor();
    else await region.getByText(/No hay lecturas válidas suficientes/).waitFor();
    check('browser renders ' + scenario.name, await region.isVisible());
    await page.screenshot({ path: path.join(out, scenario.name + '-desktop.png'), fullPage: true });
    await page.reload();
    await region.waitFor({ timeout: 30_000 });
    check('reload reuses persisted result ' + scenario.name, (await api(`/sessions/${id}/summary`)).body.data.generatedAt === summary.generatedAt);
    await page.setViewportSize({ width: 390, height: 844 });
    check('no mobile overflow ' + scenario.name, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
    await page.screenshot({ path: path.join(out, scenario.name + '-mobile.png'), fullPage: true });
    check('GET and reload do not re-enqueue ' + scenario.name, (await db.collection('sessionSummaries').doc(id).get()).data().attempts === persisted.attempts);
    await page.close();
  }
  report.status = 'PASS';
}
async function cleanup() {
  // Do not delete history or mutate any pre-existing fixture.
  const action = async (name, work) => { try { await work(); report.cleanup.push({ name, pass: true }); }
    catch { report.cleanup.push({ name, pass: false }); report.status = 'FAIL'; } };
  if (activeSessionId) await action('finish owned active session', async () => assert.equal((await api(`/sessions/${activeSessionId}/finish`, 'POST', {})).status, 200));
  if (assignmentId) await action('close owned assignment', async () => assert.equal((await api(`/assignments/${assignmentId}/close`, 'POST', {})).status, 200));
  if (credentialId && db) await action('revoke owned credential', () => db.collection('deviceCredentials').doc(credentialId).update({ enabled: false, revokedAt: new Date().toISOString() }));
  if (deviceId) await action('disable owned simulated device', async () => assert.equal((await api(`/devices/${deviceId}`, 'PATCH', { enabled: false })).status, 200));
  if (patientId) await action('disable owned synthetic patient', async () => assert.equal((await api(`/patients/${patientId}`, 'PATCH', { enabled: false })).status, 200));
  if (csrf && context) await action('logout', async () => assert.equal((await api('/auth/logout', 'POST', {})).status, 204));
  if (browser) await browser.close();
  if (db) await require('firebase-admin/app').deleteApp(require('firebase-admin/app').getApp());
}
fs.mkdirSync(out, { recursive: true });
main().catch(error => {
  report.failedStage = stage;
  report.errorType = ['Error', 'TypeError', 'AssertionError', 'TimeoutError'].includes(error?.name) ? error.name : 'OTHER';
  // Only local line numbers, never Playwright call logs (they can include auth headers).
  report.failureLocation = String(error?.stack || '').split('\n').filter(line => /at .*pulsoai-render-acceptance\.cjs:\d+:\d+/.test(line));
}).finally(async () => {
  await cleanup();
  report.owned = { patientId, deviceId, assignmentId };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, failedStage: report.failedStage, checks: report.checks.length, cleanup: report.cleanup, output: out }));
  if (report.status !== 'PASS') process.exitCode = 1;
});
