// Privileged test coordinator: setup/readback use Admin; the existing emitter uses HTTP only.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
let stage = 'preflight';

function privateWrite(file, contents) {
  fs.writeFileSync(file, contents, { flag: 'wx', mode: 0o600 });
  if (process.platform === 'win32') {
    try {
      execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${os.userInfo().username}:F`, 'SYSTEM:F'],
        { stdio: 'ignore', windowsHide: true });
    } catch { fs.unlinkSync(file); throw new Error('Could not protect private configuration'); }
  }
}

async function main() {
  const dotenv = require('dotenv');
  const env = { ...dotenv.parse(fs.readFileSync(path.join(root, 'apps/api/.env'))), ...process.env };
  assert.equal(process.versions.node.split('.')[0], '24');
  assert.equal(env.RENDER_VERIFY_ALLOW_WRITES, 'true');
  assert.equal(env.RENDER_VERIFY_PROJECT_ID, env.FIREBASE_PROJECT_ID);
  assert.equal(env.FIREBASE_PROJECT_ID, 'pulsolink-pruebas-2026-7c8a31');
  assert(!env.FIRESTORE_EMULATOR_HOST && !env.FIREBASE_AUTH_EMULATOR_HOST);
  const base = env.RENDER_VERIFY_API_BASE_URL || 'https://pulsolink-api.onrender.com/api/v1';
  const url = new URL(base);
  assert(url.protocol === 'https:' && url.pathname === '/api/v1' && !url.username && !url.password && !url.search && !url.hash);
  const privateRoot = path.join(env.LOCALAPPDATA || path.join(os.homedir(), '.config'), 'PulsoLink', env.FIREBASE_PROJECT_ID);
  const accountFile = fs.realpathSync(env.RENDER_VERIFY_ACCOUNTS_FILE || path.join(privateRoot, 'cuentas-pruebas.json'));
  for (const forbidden of [root, env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial].filter(Boolean)) {
    const relative = path.relative(path.resolve(forbidden), accountFile);
    assert(relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative));
  }
  const input = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
  const adminAccount = (Array.isArray(input) ? input : [input]).find(a => a.role === 'admin');
  assert(adminAccount?.email && adminAccount.password);
  if (adminAccount.projectId) assert.equal(adminAccount.projectId, env.FIREBASE_PROJECT_ID);
  Object.assign(process.env, env);
  const { getDb, getAuth } = require(path.join(root, 'apps/api/dist/config/firebase.js'));
  const { provisionDemo } = require(path.join(root, 'apps/api/dist/scripts/demo-provisioning.js'));
  const { Simulator } = require(path.join(root, 'tools/device-simulator/dist/simulator.js'));
  const { readSettings } = require(path.join(root, 'tools/device-simulator/dist/config.js'));
  const { createWebClient, summarize } = require(path.join(root, 'tools/device-simulator/dist/qa-web.js'));
  const db = getDb();
  assert.equal(db.projectId, env.FIREBASE_PROJECT_ID);
  const report = { generatedAt: new Date().toISOString(), project: env.FIREBASE_PROJECT_ID,
    apiBaseUrl: base, node: process.versions.node, checks: [], owned: {}, status: 'FAIL', cleanup: 'pending' };
  const check = (name, actual, expected) => {
    report.checks.push({ name, actual, expected });
    assert.deepEqual(actual, expected, name);
  };
  let session, login;
  const acks = [];
  let lastSample;
  try {
    stage = 'public health and admin login';
    const health = await fetch(base + '/health', { redirect: 'error', signal: AbortSignal.timeout(15000) });
    check('public API', health.status, 200);
    check('cloud mode', (await health.json()).firebase?.mode, 'cloud');
    const web = createWebClient({ baseUrl: base, origin: url.origin, timeoutMs: 15000 });
    login = await web.login(adminAccount.email, adminAccount.password);
    report.loginResult = summarize(login.reply);
    check('admin login', login.reply.status, 200);
    assert(login.session);
    check('admin role', login.reply.body.data.role, 'admin');
    const user = login.reply.body.data;
    const actor = await db.collection('users').doc(user.id).get();
    assert(actor.exists && actor.data().enabled && actor.data().role === 'admin');
    session = login.session;
    const create = async (route, body, key) => {
      const reply = await session.call(route, 'POST', body);
      check('create ' + key, reply.status, 201);
      assert(typeof reply.body?.data?.id === 'string');
      report.owned[key] = reply.body.data.id;
      return reply.body.data.id;
    };

    stage = 'isolated simulated fixture';
    const suffix = randomUUID().slice(0, 12);
    const patientId = await create('/patients', { code: 'RENDER-TEST-' + suffix,
      displayName: 'Paciente ficticio prueba Render' }, 'patientId');
    assert((await db.collection('patients').doc(patientId).get()).exists, 'API and verifier must use the same Firebase project');
    const deviceId = await create('/devices', { code: 'RENDER-SIM-' + suffix, source: 'simulated' }, 'deviceId');
    const deviceDoc = await db.collection('devices').doc(deviceId).get();
    assert(deviceDoc.exists && deviceDoc.data().source === 'simulated');
    const credentialId = 'render-sim-' + randomUUID();
    const secret = randomBytes(32).toString('base64url');
    report.owned.credentialId = credentialId;
    fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
    const privateConfig = path.join(privateRoot, 'simulator-render-' + suffix + '.json');
    privateWrite(privateConfig, JSON.stringify({ projectId: env.FIREBASE_PROJECT_ID, deviceId, credentialId, secret }, null, 2));
    report.privateConfigFile = privateConfig;
    await provisionDemo(db, getAuth(), { profiles: [{ uid: user.id, displayName: user.displayName, role: 'admin' }],
      deviceId, credentialId, secret });
    const settings = readSettings({ API_BASE_URL: base, DEVICE_ID: deviceId, DEVICE_CREDENTIAL_ID: credentialId,
      DEVICE_SECRET: secret, SIMULATOR_MODE: 'normal', REQUEST_TIMEOUT_MS: '5000' });
    const simulatorEnv = path.join(root, 'tools/device-simulator/.env');
    report.simulatorEnvCreated = !fs.existsSync(simulatorEnv);
    if (report.simulatorEnvCreated) {
      privateWrite(simulatorEnv, `API_BASE_URL=${base}\nDEVICE_ID=${deviceId}\nDEVICE_CREDENTIAL_ID=${credentialId}\nDEVICE_SECRET=${secret}\nSIMULATOR_MODE=normal\nREQUEST_TIMEOUT_MS=5000\nQA_ALLOW_WRITES=false\n`);
    }
    const assignmentId = await create('/assignments', { patientId, deviceId }, 'assignmentId');
    const sessionId = await create('/sessions', { assignmentId }, 'sessionId');
    check('start session', (await session.call('/sessions/' + sessionId + '/start', 'POST')).status, 200);

    stage = 'existing simulator over public HTTPS';
    let accepted = 0;
    const simulator = new Simulator(settings, {
      fetch: async (target, options) => {
        const response = await fetch(target, options);
        if (target.endsWith('/measurements') && response.status === 201) {
          const ack = await response.clone().json();
          const sample = JSON.parse(options.body);
          acks.push({ id: ack.data.measurementId, receivedAt: ack.data.receivedAt, sample });
          lastSample = sample;
        }
        return response;
      },
      log: message => {
        console.log('[simulator] ' + message);
        if (/^Medición \d+: HTTP 201/.test(message) && ++accepted === 10) simulator.stop();
      },
    });
    const timeout = setTimeout(() => simulator.stop(), 90000);
    try { await simulator.run(); } finally { clearTimeout(timeout); simulator.stop(); }
    check('bounded simulator accepted', accepted, 10);
    check('HTTP acknowledgements', acks.length, 10);

    stage = 'duplicate and independent persistence readback';
    const duplicate = await fetch(base + '/device/measurements', { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentialId}.${secret}` },
      body: JSON.stringify(lastSample), signal: AbortSignal.timeout(5000) });
    check('identical retry HTTP', duplicate.status, 200);
    const duplicateBody = await duplicate.json();
    check('identical retry flag', duplicateBody.data.duplicate, true);
    check('identical retry reference', duplicateBody.data.measurementId, acks.at(-1).id);
    const history = await session.call('/patients/' + patientId + '/measurements?limit=100');
    check('patient history HTTP', history.status, 200);
    check('persisted API rows', history.body.data.length, 10);
    check('patient history IDs', history.body.data.map(r => r.id).sort(), acks.map(r => r.id).sort());
    const stored = await db.getAll(...acks.map(a => db.collection('sessions').doc(sessionId).collection('measurements').doc(a.id)));
    for (let i = 0; i < stored.length; i++) {
      const doc = stored[i]; assert(doc.exists);
      const value = doc.data();
      check('Firestore sample ' + (i + 1), {
        patientId: value.patientId, deviceId: value.deviceId, assignmentId: value.assignmentId,
        sessionId: value.sessionId, source: value.source, bootId: value.bootId,
        sequence: value.sequence, measurements: value.measurements, receivedAt: value.receivedAt,
      }, { patientId, deviceId, assignmentId, sessionId, source: 'simulated', bootId: acks[i].sample.bootId,
        sequence: acks[i].sample.sequence, measurements: acks[i].sample.measurements, receivedAt: acks[i].receivedAt });
    }
    report.measurementIds = acks.map(a => a.id);
    report.monitoringUrl = url.origin + '/monitoring/' + patientId;
    report.status = 'PASS';
  } catch {
    report.failedStage = stage; process.exitCode = 1;
  } finally {
    const failures = [];
    if (session) {
      for (const [key, prefix, suffix] of [['sessionId', '/sessions/', '/finish'], ['assignmentId', '/assignments/', '/close']]) {
        if (!report.owned[key]) continue;
        try { const reply = await session.call(prefix + report.owned[key] + suffix, 'POST'); assert.equal(reply.status, 200); }
        catch { failures.push(key); }
      }
      try { assert.equal((await session.call('/auth/logout', 'POST')).status, 204); } catch { failures.push('logout'); }
    }
    report.cleanup = failures.length ? 'FAIL: ' + failures.join(', ')
      : !Object.keys(report.owned).length ? 'NOT_NEEDED: no fixture created'
      : 'PASS: own session/assignment closed if created; fixture and history retained for reuse';
    if (failures.length) { report.status = 'FAIL'; process.exitCode = 1; }
    const output = path.join(root, '.cache/render-simulator-results.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    await require('firebase-admin').app().delete();
    console.log(JSON.stringify({ status: report.status, failedStage: report.failedStage, checks: report.checks.length,
      owned: report.owned, cleanup: report.cleanup, monitoringUrl: report.monitoringUrl,
      report: output, privateConfigFile: report.privateConfigFile, simulatorEnvCreated: report.simulatorEnvCreated }));
  }
}
main().catch(() => {
  console.error('RENDER_SIMULATOR_FAILED: ' + stage + '. Revise Node 24, proyecto, opt-in, cuentas privadas y builds. Sin secretos registrados.');
  process.exitCode = 1;
});
