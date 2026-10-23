// Disposable emulators only. Kill a real worker process during a fake provider
// call, wait for the real five-minute lease, then recover in a second process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const childMode = process.argv[2];
assert.equal(process.versions.node.split('.')[0], '24');
assert(process.env.FIREBASE_PROJECT_ID?.startsWith('demo-'));
assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ''));
if (!childMode) process.env.FIREBASE_PROJECT_ID = 'demo-pulsoai-restart-' + randomUUID().slice(0, 8);
process.env.NODE_ENV = 'test';
const moduleAt = p => require(path.join(root, 'apps/api/dist', p));
const { getDb } = moduleAt('config/firebase.js');
const { SummaryWorker } = moduleAt('modules/pulsoai/pulsoai.service.js');
const { SummaryRepository } = moduleAt('modules/pulsoai/pulsoai.repository.js');
const { composePlan, PULSOAI_MODEL } = moduleAt('modules/pulsoai/pulsoai.provider.js');
const { SessionsRepository } = moduleAt('modules/sessions/sessions.repository.js');
const { MeasurementsRepository } = moduleAt('modules/measurements/measurements.repository.js');
const jobs = new SummaryRepository(), sessions = new SessionsRepository(), measurements = new MeasurementsRepository();
const report = { status: 'FAIL', generatedAt: new Date().toISOString(), project: process.env.FIREBASE_PROJECT_ID,
  environment: 'Firestore emulator + real Node worker processes + injected provider (zero Groq calls)', checks: [] };
const check = (name, condition) => { report.checks.push({ name, pass: Boolean(condition) }); assert(condition, name); };
const children = new Set();
async function closeDb() { await require('firebase-admin/app').deleteApp(require('firebase-admin/app').getApp()); }
async function child() {
  let calls = 0;
  await new SummaryWorker({ jobs, sessions, measurements,
    config: () => ({ enabled: true, key: 'synthetic', model: PULSOAI_MODEL }),
    generate: async facts => {
      calls++;
      if (childMode === 'interrupt') {
        process.send({ stage: 'provider-entered' });
        await new Promise(() => {});
      }
      return { model: PULSOAI_MODEL, text: composePlan(facts, { sentences: facts.map(f => ({ id: f.id, variant: 0 })) }) };
    },
  }).tick();
  process.send({ stage: 'finished', calls });
  await closeDb();
  process.disconnect();
}
function launch(mode) {
  const worker = fork(__filename, [mode], { cwd: root, env: process.env, windowsHide: true, silent: true });
  children.add(worker);
  const exited = new Promise(resolve => worker.once('exit', (code, signal) => { children.delete(worker); resolve({ code, signal }); }));
  return { worker, exited, message: new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { worker.kill(); reject(new Error('WORKER_TIMEOUT')); }, 30_000);
    worker.once('error', () => { clearTimeout(timeout); reject(new Error('WORKER_START_FAILED')); });
    worker.once('exit', () => { clearTimeout(timeout); reject(new Error('WORKER_EXITED_BEFORE_MESSAGE')); });
    worker.once('message', message => { clearTimeout(timeout); resolve(message); });
  }) };
}
async function parent() {
  const actor = 'synthetic-restart-admin';
  const { PatientsRepository } = moduleAt('modules/patients/patients.repository.js');
  const { DevicesRepository } = moduleAt('modules/devices/devices.repository.js');
  const { AssignmentsRepository } = moduleAt('modules/assignments/assignments.repository.js');
  const patient = await new PatientsRepository().create({ code: 'RESTART', displayName: 'Paciente ficticio reinicio' }, actor);
  const device = await new DevicesRepository().create({ code: 'RESTART', source: 'simulated' }, actor);
  const assignment = await new AssignmentsRepository().create({ patientId: patient.id, deviceId: device.deviceId }, actor);
  const session = await sessions.createForAssignment(assignment.id, actor);
  await sessions.start(session.sessionId, actor);
  await measurements.ingest(device.deviceId, { deviceId: device.deviceId, sessionId: session.sessionId,
    bootId: randomUUID(), sequence: 0, capturedAt: null, measurements: {
      heartRate: { value: null, unit: 'bpm', status: 'no_contact' },
      spo2: { value: null, unit: '%', status: 'no_contact' },
      skinTemperature: { value: 31, unit: 'C', status: 'valid' },
    } });
  await sessions.finish(session.sessionId, actor);
  const originalRows = (await measurements.list(session.sessionId)).data;
  const first = launch('interrupt');
  check('first process entered provider', (await first.message).stage === 'provider-entered');
  const interrupted = await jobs.get(session.sessionId);
  check('durable generating lease', interrupted.status === 'generating' && interrupted.attempts === 1);
  first.worker.kill('SIGKILL');
  await first.exited;
  check('killed process cannot finish job', (await jobs.get(session.sessionId)).status === 'generating');
  check('unexpired lease cannot be reclaimed', await jobs.claim() === null);
  report.leaseWaitMs = Math.max(0, Date.parse(interrupted.availableAt) - Date.now() + 100);
  console.log(JSON.stringify({ stage: 'waiting-real-lease-expiry', milliseconds: report.leaseWaitMs }));
  await new Promise(resolve => setTimeout(resolve, report.leaseWaitMs));
  const recovered = launch('recover');
  const result = await recovered.message;
  check('second process generated once', result.stage === 'finished' && result.calls === 1);
  check('second process exited successfully', (await recovered.exited).code === 0);
  const ready = await jobs.get(session.sessionId);
  check('ready after restart with two claims', ready.status === 'ready' && ready.attempts === 2);
  check('statistics preserve valid temperature and null optics', ready.stats.metrics.skinTemperature.mean === 31 && ready.stats.metrics.heartRate.mean === null);
  check('old lease cannot overwrite recovery', await jobs.publish(interrupted, { status: 'ready', text: 'obsolete' }) === false);
  assert.deepEqual((await measurements.list(session.sessionId)).data, originalRows);
  check('history and closed session preserved', (await sessions.getById(session.sessionId)).status === 'finished');
  check('ready is reused without more work', await jobs.claim() === null);
  report.status = 'PASS';
}
(childMode ? child() : parent()).catch(() => {
  process.exitCode = 1;
}).finally(async () => {
  if (!childMode) {
    for (const worker of children) worker.kill();
    const out = path.join(root, '.cache/pulsoai-restart');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
    await closeDb();
  }
});
