// Runs only inside the disposable-emulator verifier; no credentials are saved.
const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
module.exports = async function adminAcceptance({ browser, origin, password, db }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  const passed = [];
  const response = route => page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1' + route && r.request().method() === 'POST');
  try {
    await page.goto(origin + '/login');
    await page.getByLabel('Correo electrónico', { exact: true }).fill('demo-admin@example.invalid');
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.waitForURL('**/monitoring');
    const csrf = (await (await page.request.get(origin + '/api/v1/auth/csrf')).json()).data.csrfToken;
    const call = async (route, method = 'GET', data, expected = 200) => {
      const r = await page.request.fetch(origin + '/api/v1' + route, { method, data,
        headers: { Origin: origin, 'X-CSRF-Token': csrf } });
      assert.equal(r.status(), expected, `Administrative ${method} ${route.split('?')[0]} failed`);
      return r.status() === 204 ? null : r.json();
    };
    await page.goto(origin + '/patients');
    const trigger = page.getByRole('button', { name: 'Nuevo paciente', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    assert(await dialog.evaluate(el => el.contains(document.activeElement)));
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert(await dialog.evaluate(el => el.contains(document.activeElement))); }
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    assert(await trigger.evaluate(el => el === document.activeElement));
    passed.push('native-focus-tab-escape-return');
    await trigger.click();
    await page.getByLabel(/^Código/).fill('ADMIN-QA-A');
    await page.getByLabel(/^Nombre visible/).fill('Paciente ficticio administrativo');
    let pending = response('/patients'); await dialog.getByRole('button', { name: 'Crear paciente', exact: true }).click();
    const patient = (await (await pending).json()).data;
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('link', { name: 'Ver monitoreo de Paciente ficticio administrativo' }).waitFor();
    passed.push('patient-create-monitoring-link');
    await page.getByRole('link', { name: 'Ver monitoreo de Paciente ficticio administrativo' }).click();
    await page.getByText('No hay lecturas en este intervalo.', { exact: true }).waitFor();
    passed.push('empty-patient-real-api');
    // Catalog pages are produced by the API, never by an intercepted response.
    for (let start = 0; start < 101; start += 10) {
      await Promise.all(Array.from({ length: Math.min(10, 101 - start) }, (_, index) =>
        call('/patients', 'POST', { code: `OPT-${start + index}`, displayName: `Opción ficticia ${start + index}` }, 201)));
    }
    const createDevice = async code => {
      await page.goto(origin + '/devices');
      await page.getByRole('button', { name: 'Nueva placa', exact: true }).click();
      await page.getByLabel(/^Código/).fill(code);
      await page.getByLabel(/^Origen/).selectOption('simulated');
      const pending = response('/devices');
      await dialog.getByRole('button', { name: 'Crear placa', exact: true }).click();
      const device = (await (await pending).json()).data;
      await dialog.waitFor({ state: 'detached' });
      return device;
    };
    const d1 = await createDevice('ADMIN-QA-D1');
    const d2 = await createDevice('ADMIN-QA-D2');
    passed.push('device-forms-create');
    const ingest = async (device, sessionId) => {
      const credentialId = `admin-qa-${device.id}`;
      const secret = randomBytes(32).toString('base64url');
      await db.collection('deviceCredentials').doc(credentialId).create({ deviceId: device.id, enabled: true,
        revokedAt: null, createdAt: new Date().toISOString(), secretHash: createHash('sha256').update(secret).digest('hex') });
      const r = await page.request.post(origin + '/api/v1/device/measurements', {
        headers: { Authorization: `Bearer ${credentialId}.${secret}` }, data: {
          deviceId: device.id, sessionId, bootId: randomUUID(), sequence: 1, capturedAt: null,
          measurements: { heartRate: { value: 78, unit: 'bpm', status: 'valid' },
            spo2: { value: 97, unit: '%', status: 'valid' }, skinTemperature: { value: 29, unit: 'C', status: 'valid' } },
        } });
      assert.equal(r.status(), 201);
    };
    await page.goto(origin + '/assignments');
    await page.getByRole('button', { name: 'Asignar placa', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#assignment-patient option').length === 101);
    const initial = await page.locator('#assignment-patient option').count();
    assert.equal(initial, 101); // placeholder plus first 100
    await dialog.getByRole('button', { name: 'Cargar más pacientes', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#assignment-patient option').length > 101);
    await page.locator('#assignment-patient').selectOption(patient.id);
    await page.locator('#assignment-device').selectOption(d1.id);
    pending = response('/assignments'); await dialog.getByRole('button', { name: 'Asignar', exact: true }).click();
    const assignment = (await (await pending).json()).data;
    await dialog.waitFor({ state: 'detached' }); passed.push('options-after-100-assignment');
    await page.goto(origin + '/sessions');
    await page.getByRole('button', { name: 'Nueva Sesión', exact: true }).click();
    await page.locator('#session-assignment').selectOption(assignment.id);
    pending = response('/sessions'); await dialog.getByRole('button', { name: 'Crear sesión', exact: true }).click();
    const session = (await (await pending).json()).data;
    await dialog.waitFor({ state: 'detached' });
    const row = page.getByRole('row').filter({ hasText: session.id });
    pending = response(`/sessions/${session.id}/start`); await row.getByRole('button', { name: 'Iniciar', exact: true }).click(); await pending;
    await ingest(d1, session.id);
    const originalReading = (await call(`/patients/${patient.id}/measurements`)).data[0];
    await row.getByRole('button', { name: 'Finalizar', exact: true }).click();
    pending = response(`/sessions/${session.id}/finish`); await page.getByRole('alertdialog').getByRole('button', { name: 'Finalizar', exact: true }).click(); await pending;
    await page.getByRole('alertdialog').waitFor({ state: 'detached' }); passed.push('session-create-start-finish');
    await page.goto(origin + '/assignments'); await page.getByRole('button', { name: 'Reasignar', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#reassign-patient option').length > 1);
    while (!(await page.locator('#reassign-patient option').evaluateAll((options, value) => options.some(option => option.value === value), patient.id))) {
      const before = await page.locator('#reassign-patient option').count();
      await dialog.getByRole('button', { name: 'Cargar más pacientes', exact: true }).click();
      await page.waitForFunction(count => document.querySelectorAll('#reassign-patient option').length > count, before);
    }
    await page.locator('#reassign-patient').selectOption(patient.id);
    await page.locator('#reassign-device').selectOption(d2.id);
    await page.getByText('Se cerrará la asignación activa actual', { exact: false }).waitFor();
    pending = response('/assignments'); await dialog.getByRole('button', { name: 'Reasignar', exact: true }).click();
    const replacement = (await (await pending).json()).data;
    await dialog.waitFor({ state: 'detached' });
    assert.equal(replacement.deviceId, d2.id);
    assert.equal((await call(`/sessions/${session.id}`)).data.status, 'finished');
    assert.equal((await call(`/assignments?patientId=${patient.id}&status=closed`)).data[0].id, assignment.id);
    passed.push('reassign-preserves-previous-session');
    const secondSession = (await call('/sessions', 'POST', { assignmentId: replacement.id }, 201)).data;
    await call(`/sessions/${secondSession.id}/start`, 'POST');
    await ingest(d2, secondSession.id);
    await call(`/sessions/${secondSession.id}/finish`, 'POST');
    const history = (await call(`/patients/${patient.id}/measurements`)).data;
    assert.equal(history.length, 2);
    assert.deepEqual(history.find(reading => reading.sessionId === session.id), originalReading);
    assert.deepEqual(new Set(history.map(reading => reading.deviceId)), new Set([d1.id, d2.id]));
    await page.goto(`${origin}/monitoring/${patient.id}`);
    await page.getByText(/2 lecturas cargadas en 1 página:/).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 2);
    passed.push('official-two-device-history-immutable-and-visible');
    await call(`/patients/${patient.id}`, 'PATCH', { enabled: false }, 409);
    await call(`/devices/${d2.id}`, 'PATCH', { enabled: false }, 409);
    await call(`/assignments/${replacement.id}/close`, 'POST');
    await call(`/patients/${patient.id}`, 'PATCH', { enabled: false });
    await call(`/devices/${d2.id}`, 'PATCH', { enabled: false });
    assert.equal((await call(`/sessions/${session.id}`)).data.patientId, patient.id);
    passed.push('disable-conflict-history-retained');
    await page.goto(origin + '/admin/users'); await page.getByRole('heading', { name: /Usuarios/ }).waitFor();
    await call('/users'); await page.goto(origin + '/admin/audit'); await page.getByRole('heading', { name: /Auditoría/ }).waitFor(); await call('/audit-logs');
    passed.push('admin-users-audit');
    return passed;
  } finally { await context.close(); }
};
