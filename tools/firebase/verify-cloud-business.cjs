// Opt-in writes ONLY to a named Firebase test project; no browser or hardware proof.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { createServer } = require('node:net');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
let stage = 'preflight';

async function main() {
  const localEnv = path.join(root, 'apps/api/.env');
  const dotenv = require('dotenv');
  const environment = { ...(fs.existsSync(localEnv) ? dotenv.parse(fs.readFileSync(localEnv)) : {}), ...process.env };
  const project = environment.CLOUD_VERIFY_PROJECT_ID;
  assert.equal(process.versions.node.split('.')[0], '24');
  assert.equal(environment.CLOUD_VERIFY_ALLOW_WRITES, 'true');
  assert(project && project === environment.FIREBASE_PROJECT_ID && !project.startsWith('demo-'));
  assert(environment.NODE_ENV !== 'production' && !environment.FIRESTORE_EMULATOR_HOST && !environment.FIREBASE_AUTH_EMULATOR_HOST);
  assert(environment.FIREBASE_WEB_API_KEY && environment.CLOUD_VERIFY_ACCOUNTS_FILE);
  const privateAccounts = fs.realpathSync(environment.CLOUD_VERIFY_ACCOUNTS_FILE);
  for (const forbidden of [root, environment.OneDrive, environment.OneDriveConsumer, environment.OneDriveCommercial].filter(Boolean)) {
    const relative = path.relative(path.resolve(forbidden), privateAccounts);
    assert(relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative), 'Use un archivo privado fuera de Git/OneDrive.');
  }
  const accounts = JSON.parse(fs.readFileSync(privateAccounts, 'utf8'));
  const account = role => {
    const value = accounts.find(a => a.role === role);
    assert(value && typeof value.email === 'string' && typeof value.password === 'string');
    return { email: value.email, password: value.password };
  };
  const adminAccount = account('admin'), viewerAccount = account('viewer');
  const origin = environment.CORS_ORIGIN?.split(',')[0] || 'http://localhost:5173';
  assert(origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'));
  const reserve = createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const base = `http://127.0.0.1:${port}/api/v1`;
  Object.assign(process.env, environment);
  const { getDb, getAuth } = require(path.join(root, 'apps/api/dist/config/firebase.js'));
  const { provisionDemo } = require(path.join(root, 'apps/api/dist/scripts/demo-provisioning.js'));
  const db = getDb(); assert.equal(db.projectId, project);
  const devices = [], patients = [], assignments = [], sessions = [], secrets = [], credentialIds = [];
  const checks = []; let child;
  const report = { project, mode: 'API local y Firebase cloud reales; sin hardware/hosting',
    sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    workingTreeDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
    generatedAt: new Date().toISOString(), checks, cleanup: 'pending' };
  const check = (name, actual, expected) => { checks.push({ name, actual, expected }); assert.deepEqual(actual, expected, name); };
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const current = child; child = undefined;
    await new Promise(resolve => { const timer = setTimeout(() => { current.kill('SIGKILL'); resolve(); }, 5000);
      current.once('exit', () => { clearTimeout(timer); resolve(); }); current.kill('SIGTERM'); });
  }
  async function start() {
    // Bind only loopback. Do not start production startup-recovery work for
    // unrelated user journals while checking this run's synthetic resources.
    const entry = "const app=require('./apps/api/dist/app.js').createApp();const server=app.listen(Number(process.env.PORT),'127.0.0.1');process.on('SIGTERM',()=>server.close(()=>process.exit(0)));";
    child = spawn(process.execPath, ['-e', entry], { cwd: root, windowsHide: true, stdio: 'ignore',
      env: { ...environment, NODE_ENV: 'development', PORT: String(port), COOKIE_SECURE: 'false', LOGIN_RATE_LIMIT_MAX: '100' } });
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('API no disponible.');
  }
  function client(track = false) {
    const cookies = new Map(); let csrf;
    const call = async (route, method = 'GET', body, timeoutMs = 30000, extraHeaders = {}) => {
      const response = await fetch(base + route, { method, headers: { Origin: origin, 'Content-Type': 'application/json',
        Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), ...(csrf ? { 'x-csrf-token': csrf } : {}), ...extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(';')[0]; const split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1));
      }
      const data = response.status === 204 ? null : await response.json();
      if (track && method === 'POST' && response.status === 201 && data?.data?.id) {
        const list = { '/devices': devices, '/patients': patients, '/assignments': assignments, '/sessions': sessions }[route];
        if (list) list.push(data.data.id);
      }
      return { status: response.status, body: data };
    };
    const login = async (input, role) => {
      csrf = (await call('/auth/csrf')).body.data.csrfToken;
      const response = await call('/auth/login', 'POST', input);
      check(`${role} login`, response.status, 200); check(`${role} role`, response.body.data.role, role);
      csrf = (await call('/auth/csrf')).body.data.csrfToken;
      return response.body.data;
    };
    return { call, login };
  }
  const admin = client(true), viewer = client();
  try {
    stage = 'start and real login'; await start();
    const user = await admin.login(adminAccount, 'admin'); await viewer.login(viewerAccount, 'viewer');
    check('anonymous patients', (await client().call('/patients')).status, 401);
    check('viewer users', (await viewer.call('/users')).status, 403);
    check('viewer audit', (await viewer.call('/audit-logs')).status, 403);
    const rejected = { code: 'CLOUD-REJECT', displayName: 'No debe crearse' };
    check('viewer mutation', (await viewer.call('/patients', 'POST', rejected)).status, 403);
    check('missing CSRF', (await admin.call('/patients', 'POST', rejected, 30000, { 'x-csrf-token': '' })).status, 403);
    check('wrong origin', (await admin.call('/patients', 'POST', rejected, 30000, { Origin: 'https://invalid.example' })).status, 403);
    stage = 'own simulated devices';
    for (let i = 0; i < 2; i++) {
      const response = await admin.call('/devices', 'POST', { code: `CV-${randomUUID().slice(0, 16)}`, source: 'simulated' });
      check(`device ${i + 1} create`, response.status, 201);
      const credentialId = `cv-${randomUUID()}`, secret = randomBytes(32).toString('base64url');
      credentialIds.push(credentialId); secrets.push(secret);
      await provisionDemo(db, getAuth(), { profiles: [{ uid: user.id, displayName: user.displayName, role: 'admin' }],
        deviceId: response.body.data.id, credentialId, secret });
    }
    const device = async (index, route, body, timeoutMs = 30000) => {
      const response = await fetch(`${base}/device/${route}`, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentialIds[index]}.${secrets[index]}` },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
      return { status: response.status, body: await response.json() };
    };
    stage = 'official history and concurrency';
    const { runJointCases } = await import(pathToFileURL(path.join(root, 'tools/device-simulator/dist/qa-joint.js')).href);
    report.jointCases = await runJointCases({ admin: admin.call, devices, device });
    for (const row of report.jointCases) check(row.id, row.state, 'PASS');
    stage = 'history snapshot';
    const history = async id => {
      const rows = []; let cursor;
      do {
        const response = await admin.call(`/patients/${id}/measurements?limit=1${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
        check('history page HTTP', response.status, 200); rows.push(...response.body.data);
        cursor = response.body.pagination.nextCursor;
      } while (cursor);
      return rows;
    };
    const snapshots = new Map();
    for (const patient of patients) {
      const rows = await history(patient);
      snapshots.set(patient, createHash('sha256').update(JSON.stringify(rows)).digest('hex'));
      check('viewer history', (await viewer.call(`/patients/${patient}/measurements?limit=1`)).status, 200);
      const viewId = randomUUID();
      check('opening first', (await viewer.call(`/patients/${patient}/access`, 'POST', { viewId })).status, 201);
      const repeated = await viewer.call(`/patients/${patient}/access`, 'POST', { viewId });
      check('opening duplicate', repeated.body?.data?.duplicate, true);
    }
    stage = 'restart local API without resetting Firebase'; await stop(); await start();
    check('session survives restart', (await admin.call('/auth/me')).status, 200);
    for (const [patient, hash] of snapshots) {
      check('history persists after restart', createHash('sha256').update(JSON.stringify(await history(patient))).digest('hex'), hash);
    }
    const direct = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/patients/${patients[0]}?key=${environment.FIREBASE_WEB_API_KEY}`);
    check('direct Firestore denied', direct.status, 403);
    report.status = 'PASS';
  } catch {
    report.status = 'FAIL'; report.failedStage = stage; process.exitCode = 1;
  } finally {
    stage = 'cleanup owned resources';
    try {
      for (const id of sessions) check('cleanup finish own session', (await admin.call(`/sessions/${id}/finish`, 'POST')).status, 200);
      for (const id of assignments) check('cleanup close own assignment', (await admin.call(`/assignments/${id}/close`, 'POST')).status, 200);
      for (const id of devices) check('cleanup disable own device', (await admin.call(`/devices/${id}`, 'PATCH', { enabled: false })).status, 200);
      for (const id of patients) check('cleanup disable own patient', (await admin.call(`/patients/${id}`, 'PATCH', { enabled: false })).status, 200);
      for (const id of credentialIds) await db.collection('deviceCredentials').doc(id).update({ enabled: false, revokedAt: new Date().toISOString() });
      report.cleanup = 'PASS; solo se cerraron/deshabilitaron recursos creados por esta ejecución; sin borrado histórico';
    } catch { report.cleanup = 'FAIL; revisar los IDs del informe'; report.status = 'FAIL'; process.exitCode = 1; }
    report.owned = { devices, patients, assignments, sessions, credentialIds };
    await stop();
    await require('firebase-admin').app().delete();
    const output = path.resolve(environment.CLOUD_VERIFY_REPORT || path.join(root, '.cache/cloud-business-results.json'));
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, failedStage: report.failedStage, project, checks: checks.length, cleanup: report.cleanup, report: output }));
  }
}
main().catch(() => { console.error(`CLOUD_BUSINESS_FAILED: ${stage}. Revise proyecto explícito, consentimiento de escritura, cuentas privadas y build. Sin secretos registrados.`); process.exitCode = 1; });
