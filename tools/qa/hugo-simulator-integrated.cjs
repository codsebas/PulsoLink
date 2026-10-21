// Official CLI against real local API/emulators, with a socket-cutting HTTP proxy.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  assert.equal(process.env.QA_ALLOW_WRITES, 'true');
  const output = path.resolve(process.env.QA_SIM_OUTPUT || 'docs/evidencias/hugo-integrated-simulator');
  await fs.mkdir(output, { recursive: true });
  const base = 'http://localhost:3001/api/v1';
  const cookies = new Map(); let csrf = ''; let child; let assignment; let session; let browser;
  const results = []; const traffic = []; let offline = false;
  async function admin(route, method = 'GET', body) {
    const res = await fetch(base + route, { method, headers: { Origin: 'http://localhost:5173', Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const header of res.headers.getSetCookie()) { const pair = header.split(';')[0]; const i = pair.indexOf('='); cookies.set(pair.slice(0,i), pair.slice(i+1)); }
    const json = await res.json().catch(() => null); if (json?.data?.csrfToken) csrf = json.data.csrfToken;
    assert.ok(res.ok, `${method} ${route.split('?')[0]} HTTP ${res.status}`); return json;
  }
  const proxy = createServer(async (req, res) => {
    const time = Date.now();
    if (offline) { traffic.push({ time, path: req.url, cut: true }); req.socket.destroy(); return; }
    try {
      let raw = ''; for await (const part of req) raw += part;
      const response = await fetch('http://localhost:3001' + req.url, { method: req.method, headers: { Authorization: req.headers.authorization || '', 'Content-Type': 'application/json' }, body: raw || undefined });
      const payload = raw ? JSON.parse(raw) : null;
      traffic.push({ time, path: req.url, status: response.status, sequence: payload?.sequence, bootId: payload?.bootId });
      res.writeHead(response.status, { 'Content-Type': 'application/json' }); res.end(await response.text());
    } catch { res.destroy(); }
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const launch = mode => {
    child = spawn(process.execPath, ['--import', 'tsx', 'tools/device-simulator/src/index.ts'], { env: { ...process.env, API_BASE_URL: `http://127.0.0.1:${proxy.address().port}/api/v1`, DEVICE_ID: 'qa-joint-device-1', DEVICE_CREDENTIAL_ID: 'qa-joint-credential-1', SIMULATOR_MODE: mode }, stdio: 'ignore' });
  };
  const stop = async () => { if (child && child.exitCode === null) { const current = child; const ended = new Promise(resolve => current.once('exit', resolve)); current.kill(); await ended; } child = null; };
  const waitUntil = async (predicate, timeout = 15000) => { const end = Date.now() + timeout; while (!await predicate()) { assert.ok(Date.now() < end, 'Condition timed out'); await sleep(250); } };
  const pass = (id, actual) => results.push({ id, state: 'PASS', actual });
  try {
    await admin('/auth/csrf'); await admin('/auth/login', 'POST', { email: process.env.QA_ADMIN_EMAIL, password: process.env.QA_PASSWORD }); await admin('/auth/csrf');
    launch('normal'); await sleep(3500);
    assert.ok(traffic.some(r => r.path.endsWith('/heartbeat') && r.status === 200)); assert.ok(!traffic.some(r => r.path.endsWith('/measurements')));
    pass('SIM-I01', 'CLI oficial: config/heartbeat sin sesión, cero mediciones');
    const patient = (await admin('/patients', 'POST', { code: 'QA-SIM-' + randomUUID().slice(0,8), displayName: 'Simulador integrado Hugo' })).data.id;
    assignment = (await admin('/assignments', 'POST', { patientId: patient, deviceId: 'qa-joint-device-1' })).data.id;
    session = (await admin('/sessions', 'POST', { assignmentId: assignment })).data.id;
    await admin(`/sessions/${session}/start`, 'POST');
    const rows = async () => (await admin(`/patients/${patient}/measurements?limit=100`)).data;
    await waitUntil(async () => (await rows()).length >= 3);
    const before = await rows(); assert.ok(before.every(r => r.patientId === patient && r.sessionId === session && r.assignmentId === assignment && r.source === 'simulated'));
    pass('SIM-I02', 'CLI detecta inicio, persiste muestras nuevas con los cuatro IDs del backend');
    browser = await chromium.launch({ channel: 'msedge', headless: true }); const context = await browser.newContext();
    const page = await context.newPage(); await page.goto('http://localhost:5173/login');
    await page.getByLabel('Correo electrónico').fill(process.env.QA_VIEWER_EMAIL); await page.getByLabel('Contraseña', { exact: true }).fill(process.env.QA_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click(); await page.waitForURL('**/monitoring'); await page.goto(`http://localhost:5173/monitoring/${patient}`);
    await page.getByText('Conectado con lectura reciente', { exact: true }).waitFor(); await page.screenshot({ path: path.join(output,'connected.png') });
    offline = true; const cutAt = Date.now(); await sleep(12000);
    assert.equal((await admin(`/patients/${patient}/latest`)).meta.stale, true);
    await page.getByText('Sin lectura reciente; consulta el historial para ver datos anteriores.').waitFor();
    await sleep(38000);
    assert.equal((await admin(`/patients/${patient}/latest`)).meta.connectionState, 'disconnected');
    await page.getByText('Desconectado', { exact: true }).waitFor(); await page.screenshot({ path: path.join(output,'disconnected.png') });
    const during = await rows(); const reconnectAt = Date.now(); offline = false;
    await waitUntil(async () => (await rows()).length >= during.length + 2);
    const after = await rows(); const newRows = after.filter(r => !during.some(old => old.id === r.id));
    assert.ok(newRows.every(r => Date.parse(r.receivedAt) >= reconnectAt && r.capturedAt === null));
    const sent = traffic.filter(r => r.path.endsWith('/measurements') && r.status === 201 && r.time >= reconnectAt);
    assert.ok(sent.length >= 2); assert.ok(sent.slice(1).every((r,i) => r.time - sent[i].time >= 1900));
    assert.ok(traffic.some(r => r.cut)); assert.ok(!traffic.some(r => r.time > cutAt + 1000 && r.time < reconnectAt && r.status === 201));
    pass('SIM-I03', 'Corte de sockets de 50 s: stale, disconnected y reconexión sin cola; muestras nuevas espaciadas >=1900 ms');
    await stop(); launch('no_contact');
    await waitUntil(async () => (await rows())[0]?.measurements.heartRate.status === 'no_contact');
    const contact = (await rows())[0]; assert.equal(contact.measurements.heartRate.value, null); assert.equal(contact.measurements.spo2.value, null); assert.equal(contact.measurements.skinTemperature.status, 'valid');
    await page.reload(); await page.locator('article').filter({ hasText: 'Pulso' }).getByText('Sin contacto', { exact: true }).waitFor(); await page.screenshot({ path: path.join(output,'no-contact.png') });
    pass('SIM-I04', 'Modo no_contact real: ópticos null, temperatura válida; estado de calidad visible en web');
    await stop(); launch('unavailable');
    await waitUntil(async () => (await rows())[0]?.measurements.skinTemperature.status === 'unavailable');
    await page.reload(); await page.getByText('Conectado sin lectura válida reciente', { exact: true }).waitFor();
    pass('SIM-I04b', 'Modo unavailable: tres magnitudes null, conectado sin lectura válida; distinto de desconectado');
    await admin(`/sessions/${session}/finish`, 'POST'); await sleep(3000); const count = (await rows()).length; await sleep(3500); assert.equal((await rows()).length, count);
    await page.reload(); await page.getByText('Sin sesión activa · consulta histórica', { exact: true }).waitFor(); await page.locator('tbody tr').first().waitFor();
    pass('SIM-I05', 'Fin oficial detiene nuevas muestras; recarga web conserva historia');
    await stop(); await admin(`/assignments/${assignment}/close`, 'POST'); assignment = null; session = null;
    await admin('/devices/qa-joint-device-1', 'PATCH', { enabled: false }); launch('normal');
    await waitUntil(() => child.exitCode !== null); assert.equal(child.exitCode, 1); pass('SIM-I06', 'Placa deshabilitada: CLI termina con código 1');
    await admin('/devices/qa-joint-device-1', 'PATCH', { enabled: true });
  } catch (error) { results.push({ id: 'SIM-INTEGRATED', state: 'FAIL', actual: error instanceof assert.AssertionError ? 'Aserción de aceptación incumplida' : 'Ejecución interrumpida; revisar entorno' }); }
  finally {
    await stop(); if (browser) await browser.close(); proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve));
    try { if (session) await admin(`/sessions/${session}/finish`, 'POST'); if (assignment) await admin(`/assignments/${assignment}/close`, 'POST'); await admin('/devices/qa-joint-device-1', 'PATCH', { enabled: true }); } catch { results.push({ id:'CLEANUP',state:'FAIL',actual:'Revisar recursos dedicados de QA' }); }
    await fs.writeFile(path.join(output,'results.json'), JSON.stringify({ generatedAt:new Date().toISOString(), base:'abc4d45', environment:process.env.QA_ENVIRONMENT, method:'CLI oficial; proxy HTTP corta sockets 50s; API y persistencia reales en emuladores',results,traffic },null,2)+'\n');
    console.log(JSON.stringify(results)); process.exitCode = results.some(r=>r.state==='FAIL') ? 1 : 0;
  }
}
main().catch(()=>{ console.error('Preparación de integración no disponible');process.exitCode=1; });
