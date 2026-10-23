// Real browser -> Vite proxy -> API -> local Auth/Firestore emulators.
// Requires the Auth and monitoring-data implementations from PRs #41/#42.
// Never exports cookies, passwords or tokens to files or command arguments.
const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { createServer } = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const admin = require('firebase-admin');
const root = path.resolve(__dirname, '../..');
let step = 'preflight';

async function main() {
  assert.equal(process.versions.node.split('.')[0], '24', 'Use Node.js 24.');
  assert(process.env.FIREBASE_PROJECT_ID?.startsWith('demo-'), 'Disposable demo- project required.');
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    assert(/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[key] ?? ''), 'Both local emulators are required.');
  }
  for (const file of ['apps/web/src/features/auth/auth.api.ts', 'apps/web/src/features/patient-monitoring/hooks.ts',
    'apps/api/src/scripts/monitoring-fixtures.ts', 'apps/api/dist/scripts/monitoring-fixtures.js']) {
    assert(fs.existsSync(path.join(root, file)), 'Integrate Auth/monitoring dependencies and run npm run build first.');
  }
  const packagePath = (process.env.PATH || '').split(path.delimiter)
    .map((entry) => path.resolve(entry, '..', 'playwright'))
    .find((entry) => fs.existsSync(path.join(entry, 'package.json')));
  const { chromium } = require(process.env.PULSOLINK_PLAYWRIGHT_MODULE || packagePath || 'playwright');
  const origin = 'http://localhost:15173';
  const api = 'http://127.0.0.1:13001';
  const children = [];
  let browser;
  let visibilityProfile;
  const nativeVisibility = process.env.PULSOLINK_NATIVE_VISIBILITY === 'true';
  const environment = { ...process.env, NODE_ENV: 'development', PORT: '13001', CORS_ORIGIN: origin,
    COOKIE_SECURE: 'false', FIREBASE_WEB_API_KEY: 'emulator', CSRF_SECRET: randomBytes(32).toString('hex'),
    VITE_API_PROXY_TARGET: api, VITE_API_BASE_URL: '/api/v1' };
  try {
    for (const url of [origin, `${api}/api/v1/health`]) {
      let occupied = false;
      try { await fetch(url, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
      assert(!occupied, 'Verification ports 13001/15173 must be free.');
    }
    step = 'seed twice';
    const app = admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }, 'gerson-browser');
    const db = app.firestore();
    const auth = app.auth();
    const load = (file) => import(pathToFileURL(path.join(root, 'apps/api/dist/scripts', file)).href);
    const { seedEmulators } = await load('emulator-fixtures.js');
    const { seedMonitoringDataset } = await load('monitoring-fixtures.js');
    const password = randomBytes(24).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    const first = await seedEmulators(db, auth, { password, secret });
    assert.equal(first.profilesCreated, 2, 'Use fresh disposable emulators.');
    assert.equal((await seedMonitoringDataset(db)).readings, 240);
    assert.deepEqual(await seedEmulators(db, auth, { password, secret }),
      { profilesCreated: 0, deviceCreated: false, credentialCreated: false });
    assert.equal((await seedMonitoringDataset(db)).datasetCreated, false);
    children.push(spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/server.ts'],
      { cwd: root, env: environment, windowsHide: true, stdio: 'ignore' }));
    children.push(spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', '15173', '--strictPort'],
      { cwd: path.join(root, 'apps/web'), env: environment, windowsHide: true, stdio: 'ignore' }));
    step = 'servers';
    for (const url of [`${api}/api/v1/health`, origin]) {
      let ready = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      assert(ready, 'Local verification server did not become ready.');
    }
    let page;
    if (nativeVisibility) {
      // Playwright's default focus emulation keeps background tabs visible.
      // A dedicated Edge with noDefaults exercises the actual browser event.
      fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
      visibilityProfile = fs.mkdtempSync(path.join(root, '.cache/gerson-visibility-'));
      const reserve = createServer();
      await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
      const port = reserve.address().port;
      await new Promise(resolve => reserve.close(resolve));
      children.push(spawn(process.env.PULSOLINK_EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        ['--headless=new', '--disable-sync', '--disable-features=msImplicitSignin', '--no-default-browser-check', `--remote-debugging-port=${port}`, `--user-data-dir=${visibilityProfile}`, '--no-first-run'],
        { windowsHide: true, stdio: 'ignore' }));
      for (let attempt = 0; attempt < 40; attempt++) {
        try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true, timeout: 500 }); break; }
        catch { await new Promise(resolve => setTimeout(resolve, 100)); }
      }
      assert(browser, 'Dedicated browser is not available.');
      page = await browser.contexts()[0].newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
    } else {
      browser = await chromium.launch({ channel: process.env.PULSOLINK_BROWSER_CHANNEL || 'chrome', headless: true });
      page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    }
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(60000); // Vite's first dependency transform is cold on a new checkout.
    const counts = { access: 0, latest: 0, archive: 0, history: 0 };
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/monitor-patient/access')) counts.access++;
      if (url.pathname.endsWith('/monitor-patient/latest')) counts.latest++;
      if (url.pathname.endsWith('/monitor-patient/measurements')) counts.history++;
      if (url.pathname.endsWith('/monitor-patient/measurements') && url.searchParams.get('limit') === '100') counts.archive++;
    });
    step = 'viewer: open protected route';
    await page.goto(`${origin}/monitoring/monitor-patient`);
    step = 'viewer: redirect to login';
    await page.waitForURL('**/login');
    step = 'viewer: fill login form';
    await page.getByLabel('Correo electrónico', { exact: true }).fill('demo-viewer@example.invalid');
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    step = 'viewer: return after login';
    await page.waitForURL('**/monitoring/monitor-patient');
    await page.getByRole('heading', { name: 'Paciente seudónimo de monitoreo', exact: true }).waitFor();
    await page.getByText(/100 lecturas cargadas en 1 página:/).waitFor();
    if (process.env.PULSOLINK_UI_CONTRAST_ONLY === 'true') {
      // PL2-08 sección E (Axel): contraste API ↔ web; ejecución independiente del historial largo.
      step = 'UI contrast acceptance (PL2-08 E)';
      const results = await require('../qa/ui-contrast-acceptance.cjs')({ browser, origin, password });
      const output = path.resolve(process.env.PULSOLINK_EVIDENCE_DIR || path.join(root, '.cache/axel-ui-contrast'));
      fs.mkdirSync(output, { recursive: true });
      const failed = results.some((result) => result.state === 'FAIL');
      fs.writeFileSync(path.join(output, 'ui-contrast.json'), JSON.stringify({
        environment: process.env.PULSOLINK_ENVIRONMENT || 'Auth/Firestore Standard emulados', browser: browser.version(),
        fabricatedResponses: false, checkedAt: new Date().toISOString(), node: process.version,
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
        results, status: failed ? 'failed' : 'passed',
      }, null, 2) + '\n');
      console.log(JSON.stringify({ uiContrast: failed ? 'failed' : 'passed', results }));
      if (failed) process.exitCode = 1;
      return;
    }
    if (process.env.PULSOLINK_RESPONSIVE_AUDIT === 'true') {
      // PL2-14 (#74): medición responsiva comparable entre versiones; no verifica el historial largo.
      step = 'responsive audit (PL2-14)';
      const output = path.resolve(process.env.PULSOLINK_EVIDENCE_DIR || path.join(root, '.cache/ui-responsive-audit'));
      const audit = await require('../qa/ui-responsive-audit.cjs')({ browser, origin, password, output,
        screenshots: process.env.PULSOLINK_AUDIT_SCREENSHOTS || 'viewport',
        screenshotWidths: process.env.PULSOLINK_AUDIT_SCREENSHOT_WIDTHS ? process.env.PULSOLINK_AUDIT_SCREENSHOT_WIDTHS.split(',').map(Number) : null });
      fs.writeFileSync(path.join(output, 'audit.json'), JSON.stringify({
        environment: process.env.PULSOLINK_ENVIRONMENT || 'Auth/Firestore Standard emulados', browser: browser.version(),
        checkedAt: new Date().toISOString(), node: process.version,
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
        ...audit,
      }, null, 2) + '\n');
      console.log(JSON.stringify({ responsiveAudit: 'written', routes: audit.results.length, output: path.relative(root, output) }));
      return;
    }
    step = 'history tests against authenticated API';
    // Repository integration tests receive this disposable session in memory.
    // Nothing is written to storageState, .env or a credential file.
    const session = (await page.context().cookies(origin)).find((cookie) => cookie.name === 'pulsolink_session');
    assert(session, 'Expected a real HttpOnly session.');
    const integration = spawn(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run',
      'test/monitoring-api.integration.test.ts', '--maxWorkers=2'], {
      cwd: path.join(root, 'apps/web'), windowsHide: true,
      env: { ...environment, PULSOLINK_API_URL: origin, PULSOLINK_PATIENT_ID: 'monitor-patient',
        PULSOLINK_SESSION_COOKIE: `${session.name}=${session.value}` }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(integration);
    // Consume output without printing potential error payloads or credentials.
    integration.stdout.resume(); integration.stderr.resume();
    const integrationCode = await new Promise((resolve, reject) => {
      integration.once('error', reject); integration.once('exit', resolve);
    });
    assert.equal(integrationCode, 0, 'Real-API history tests failed.');
    const verifyUi = async () => {
      const output = path.resolve(process.env.PULSOLINK_EVIDENCE_DIR || path.join(root, '.cache/gerson-integration'));
      fs.mkdirSync(output, { recursive: true });
      assert.equal((await page.request.get(`${origin}/api/v1/users`)).status(), 403);
      assert.equal((await page.request.get(`${origin}/api/v1/audit-logs`)).status(), 403);
      assert.equal(await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Usuarios', exact: true }).count(), 0);
      assert.equal(await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Auditoría', exact: true }).count(), 0);
      step = 'dashboard responsive and accessibility acceptance';
      const checks = await require('../qa/dashboard-acceptance.cjs')({ page, output });
      checks.push('viewer-admin-controls-hidden-http403');
      step = 'administrative real API acceptance';
      checks.push(...await require('../qa/admin-acceptance.cjs')({ browser, origin, password, db }));
      fs.writeFileSync(path.join(output, 'ui-acceptance.json'), JSON.stringify({
        environment: 'Windows, Node 24, Edge, Auth/Firestore Standard emulados',
        fabricatedResponses: false, faultInjection: 'Se aborta la petición de una página histórica y se restablece la red',
        checkedAt: new Date().toISOString(), node: process.version,
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
        workingTree: true, checks, status: 'passed',
      }, null, 2) + '\n');
      console.log(JSON.stringify({ uiAcceptance: 'passed', checks }));
    };
    if (process.env.PULSOLINK_UI_ACCEPTANCE_ONLY === 'true') {
      await verifyUi();
      return; // El historial largo y la visibilidad nativa tienen ejecuciones independientes.
    }
    step = 'three history pages';
    const more = page.getByRole('button', { name: 'Cargar más antiguas', exact: true });
    await more.click();
    await page.getByText(/200 lecturas cargadas en 2 páginas:/).waitFor();
    await more.click();
    await page.getByText(/240 lecturas cargadas en 3 páginas:/).waitFor();
    assert(await more.isDisabled());
    assert.equal(await page.locator('tbody tr').count(), 240);
    const cells = await page.locator('tbody').innerText();
    assert(cells.includes('monitor-device-1') && cells.includes('monitor-device-2'));
    assert(cells.includes('Sin contacto'));
    assert.equal((await db.collectionGroup('measurements').where('patientId', '==', 'monitor-patient').get()).size, 240);
    step = 'polling and audit';
    const archiveBefore = counts.archive;
    const latestBefore = counts.latest;
    await page.waitForTimeout(2400);
    assert(counts.latest > latestBefore);
    assert.equal(counts.archive, archiveBefore, 'Polling downloaded the accumulated archive again.');
    assert.equal(counts.access, 1);
    assert.equal((await db.collection('auditLogs').where('actorId', '==', 'demo-viewer')
      .where('action', '==', 'patient.view').get()).size, 1);
    step = 'connection states and new persisted readings';
    const latestUrl = `${origin}/api/v1/patients/monitor-patient/latest`;
    let state = await (await page.request.get(latestUrl)).json();
    assert.equal(state.meta.connectionState, 'disconnected');
    // Seeded device presence is old. Wait until the last sample is stale,
    // then simulate presence and new sensor samples through real repositories.
    await page.waitForTimeout(Math.max(0, 11_000 - state.meta.ageMs));
    const modules = (file) => import(pathToFileURL(path.join(root, 'apps/api/dist/modules', file)).href);
    const { DevicesRepository } = await modules('devices/devices.repository.js');
    const { MeasurementsRepository } = await modules('measurements/measurements.repository.js');
    await new DevicesRepository(() => db).heartbeat('monitor-device-2');
    await page.getByText('Conectado sin lectura válida reciente', { exact: true }).waitFor();
    const repository = new MeasurementsRepository(() => db);
    const sample = { deviceId: 'monitor-device-2', sessionId: 'monitor-session-2', bootId: randomUUID(),
      sequence: 0, capturedAt: null, measurements: {
        heartRate: { value: 77, unit: 'bpm', status: 'valid' },
        spo2: { value: 98, unit: '%', status: 'valid' },
        skinTemperature: { value: 33.4, unit: 'C', status: 'valid' },
      } };
    await repository.ingest('monitor-device-2', sample);
    assert.equal((await repository.ingest('monitor-device-2', sample)).duplicate, true);
    await page.getByText('Conectado con lectura reciente', { exact: true }).waitFor();
    await repository.ingest('monitor-device-2', { ...sample, sequence: 1, measurements: {
      heartRate: { value: null, unit: 'bpm', status: 'no_contact' },
      spo2: { value: null, unit: '%', status: 'no_contact' },
      skinTemperature: sample.measurements.skinTemperature,
    } });
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.getByText(/242 lecturas cargadas en \d+ páginas:/).waitFor();
    state = await (await page.request.get(latestUrl)).json();
    assert.equal(state.meta.connectionState, 'connected_with_recent_reading');
    assert.equal(state.data.measurements.heartRate.value, null);
    assert.equal(state.data.measurements.skinTemperature.value, 33.4);
    await page.getByRole('article', { name: 'Pulso', exact: true }).getByText('Sin contacto', { exact: true }).waitFor();
    assert.equal(await page.getByRole('article', { name: 'Pulso', exact: true }).getByText('—', { exact: true }).count(), 1);
    await page.getByRole('article', { name: 'Temperatura superficial', exact: true }).getByText('Lectura válida', { exact: true }).waitFor();
    assert.equal((await db.collectionGroup('measurements').where('patientId', '==', 'monitor-patient').get()).size, 242);
    assert.equal(counts.access, 1);
    step = 'HIST-01 official HTTP continuity';
    const deviceSecret = randomBytes(32).toString('base64url');
    await db.collection('deviceCredentials').doc('monitor-browser-credential').create({
      deviceId: 'monitor-device-2', enabled: true, revokedAt: null,
      createdAt: new Date().toISOString(), secretHash: createHash('sha256').update(deviceSecret).digest('hex'),
    });
    let sequence = 2;
    async function ingestOfficial(amount, measurements) {
      for (let i = 0; i < amount; i++) {
        const current = sequence++;
        const input = { ...sample, sequence: current, measurements: {
          ...sample.measurements,
          heartRate: { value: 100 + current % 100, unit: 'bpm', status: 'valid' },
          skinTemperature: { value: 30 + Math.floor(current / 100) / 10, unit: 'C', status: 'valid' },
        } };
        if (measurements) input.measurements = measurements;
        const response = await fetch(`${api}/api/v1/device/measurements`, {
          method: 'POST', headers: { 'Content-Type': 'application/json',
            Authorization: `Bearer monitor-browser-credential.${deviceSecret}` },
          body: JSON.stringify(input), signal: AbortSignal.timeout(30000),
        });
        assert.equal(response.status, 201, 'Official device ingestion failed.');
      }
    }
    for (let round = 0; round < 2; round++) {
      step = `HIST-01 round ${round + 1}: ingestion`;
      await ingestOfficial(21);
      step = `HIST-01 round ${round + 1}: refresh`;
      await page.getByRole('button', { name: 'Refrescar lecturas recientes', exact: true }).click();
      step = `HIST-01 round ${round + 1}: visible rows`;
      await page.getByText(new RegExp(`${263 + round * 21} lecturas cargadas en `)).waitFor();
      assert.equal(await page.locator('tbody tr').count(), 263 + round * 21);
    }
    if (nativeVisibility) {
      step = 'native hidden-visible continuity';
      await page.bringToFront();
      assert.equal(await page.evaluate(() => document.visibilityState), 'visible');
      const other = await page.context().newPage();
      await other.goto('about:blank'); await other.bringToFront();
      assert.equal(await page.evaluate(() => document.visibilityState), 'hidden');
      await page.waitForTimeout(1000); // Allow requests already in flight to finish.
      const hiddenRequests = counts.latest + counts.history;
      await ingestOfficial(47);
      await page.waitForTimeout(11000);
      assert.equal(counts.latest + counts.history, hiddenRequests, 'Polling continued while hidden.');
      await page.bringToFront();
      assert.equal(await page.evaluate(() => document.visibilityState), 'visible');
      await page.getByText(/331 lecturas cargadas en /).waitFor();
      assert.equal(await page.locator('tbody tr').count(), 331);
      await other.close();
      console.log(JSON.stringify({ nativeVisibility: 'passed', stateChanges: ['visible', 'hidden', 'visible'],
        newReadingsWhileHidden: 47, recoveredRows: 331, requestsWhileHidden: 0 }));
    }
    step = 'HIST-02 bounded navigation through 1120 official readings';
    await ingestOfficial(nativeVisibility ? 789 : 836);
    await page.reload();
    await page.getByText(/100 lecturas cargadas en 1 página:/).waitFor();
    const visited = new Set();
    let maxVisible = 0;
    for (let index = 0; index < 15; index++) {
      const rows = await page.locator('tbody tr').allTextContents();
      rows.forEach(row => visited.add(row));
      maxVisible = Math.max(maxVisible, rows.length);
      assert(rows.length <= 1000, 'History retained more than its bounded window.');
      if (await more.isDisabled()) break;
      const response = page.waitForResponse(r => r.url().includes('/measurements') && r.url().includes('cursor='));
      await more.click(); await response;
      await page.waitForFunction(() => !document.querySelector('button[disabled]') ||
        [...document.querySelectorAll('button')].find(b => b.textContent === 'Refrescar lecturas recientes')?.disabled === false);
    }
    assert.equal(visited.size, 1120, 'Some persisted readings could not be inspected through navigation.');
    assert(await more.isDisabled());
    await page.getByRole('button', { name: 'Refrescar lecturas recientes', exact: true }).click();
    await page.getByText(/100 lecturas cargadas en 1 página:/).waitFor();
    assert(await more.isEnabled(), 'Returning to recent readings must restore older navigation.');
    console.log(JSON.stringify({ historyRegression: 'passed', successiveRefreshReadings: 284,
      navigableReadings: visited.size, maxVisibleReadings: maxVisible, returnsToRecent: true }));
    if (process.env.PULSOLINK_FULL_UI_ACCEPTANCE === 'true') {
      step = 'independent invalid and unavailable sensor qualities';
      await ingestOfficial(1, {
        heartRate: { value: null, unit: 'bpm', status: 'invalid' },
        spo2: { value: null, unit: '%', status: 'unavailable' },
        skinTemperature: { value: 29.4, unit: 'C', status: 'valid' },
      });
      await page.getByRole('article', { name: 'Pulso', exact: true }).getByText('Dato inválido', { exact: true }).waitFor();
      await page.getByRole('article', { name: 'SpO₂ estimada', exact: true }).getByText('No disponible', { exact: true }).waitFor();
      for (const name of ['Pulso', 'SpO₂ estimada']) {
        assert.equal(await page.getByRole('article', { name, exact: true }).getByText('—', { exact: true }).count(), 1);
      }
    }
    step = 'viewer restrictions';
    assert.equal((await page.request.get(`${origin}/api/v1/users`)).status(), 403);
    assert.equal((await page.request.get(`${origin}/api/v1/audit-logs`)).status(), 403);
    step = 'desktop and mobile';
    const output = path.resolve(process.env.PULSOLINK_EVIDENCE_DIR || path.join(root, '.cache/gerson-integration'));
    fs.mkdirSync(output, { recursive: true });
    if (process.env.PULSOLINK_FULL_UI_ACCEPTANCE === 'true') {
      await verifyUi();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    await page.setViewportSize({ width: 375, height: 812 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'mobile.png') });
    step = 'exit and logout';
    await page.getByRole('link', { name: '← Pacientes', exact: true }).click();
    await page.getByRole('heading', { name: 'Monitoreo de pacientes', exact: true }).waitFor();
    const stopped = counts.latest;
    await page.waitForTimeout(2400);
    assert.equal(counts.latest, stopped);
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await page.waitForURL('**/login');
    await page.goto(`${origin}/monitoring/monitor-patient`);
    await page.waitForURL('**/login');
    assert.equal(await page.getByRole('heading', { name: 'Paciente seudónimo de monitoreo', exact: true }).count(), 0);
    console.log(JSON.stringify({ patientBrowser: 'passed', api: 'real-local', emulators: 'auth-firestore-standard',
      seedRepeated: true, realApiHistoryTests: 2, initialPages: 3, historicalReadings: 240, finalReadings: 1120, boards: 2, accessEvents: counts.access,
      connectionStates: 3, identicalDuplicate: true, opticalNullIndependentOfTemperature: true,
      archiveNotPolled: true, pollingStops: true, viewer403: true, logoutClearsView: true, mobileOverflow: false }));
  } finally {
    if (browser) {
      if (nativeVisibility) {
        try { const session = await browser.newBrowserCDPSession(); await session.send('Browser.close'); } catch {}
      }
      await browser.close();
    }
    for (const child of children) if (child.pid && child.exitCode === null) child.kill();
    await Promise.all(admin.apps.map((app) => app.delete()));
    if (visibilityProfile && path.dirname(path.resolve(visibilityProfile)) === path.resolve(root, '.cache') &&
      path.basename(visibilityProfile).startsWith('gerson-visibility-')) {
      try { fs.rmSync(visibilityProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
    }
  }
}
main().catch(error => {
  // Only a controlled stage is printed: browser/API errors can contain credentials.
  console.error(`PATIENT_BROWSER_FAILED: ${step}. Check dependencies, fresh emulators and browser installation; no credentials logged.`);
  console.error(`Failure category: ${error instanceof assert.AssertionError ? 'assertion' : error?.name || 'unknown'}`);
  if (error instanceof assert.AssertionError) console.error(error.message);
  console.error(String(error?.stack ?? '').split('\n').filter(line => line.trim().startsWith('at ')).slice(0, 3).join('\n'));
  process.exitCode = 1;
});
