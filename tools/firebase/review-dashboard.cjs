// Visual contract fixture only. This does not prove API or Firestore integration;
// those are exercised separately by patient-monitoring-api.test.ts.
module.exports = async function reviewDashboard(page) {
  await page.unroute('**/api/v1/**');
  const now = Date.now();
  const patient = { id: 'demo-patient-a', code: 'P-DEMO-A', displayName: 'Paciente de demostración A', enabled: true,
    createdAt: new Date(now - 180000).toISOString(), updatedAt: new Date(now).toISOString() };
  const rows = [];
  for (let index = 0; index < 48; index++) {
    const second = index >= 24;
    const sequence = index % 24;
    const noContact = sequence % 7 === 0;
    rows.push({ id: `reading-${sequence}`, patientId: patient.id, sessionId: second ? 'demo-session-2' : 'demo-session-1',
      assignmentId: second ? 'demo-assignment-2' : 'demo-assignment-1', deviceId: second ? 'demo-device-2' : 'demo-device-1', source: 'simulated',
      receivedAt: new Date(now - (second ? 48000 : 180000) + sequence * 2000).toISOString(), capturedAt: null, sequence, bootId: 'demo-boot',
      measurements: { heartRate: { value: noContact ? null : 74 + sequence % 5, status: noContact ? 'no_contact' : 'valid', unit: 'bpm' },
        spo2: { value: noContact ? null : 97, status: noContact ? 'no_contact' : 'valid', unit: '%' },
        skinTemperature: { value: 33.1 + sequence % 3 / 10, status: 'valid', unit: 'C' } } });
  }
  rows.reverse();
  const calls = { access: 0, latest: 0, history: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const requestUrl = route.request().url();
    const path = requestUrl.split('/api/v1')[1].split('?')[0];
    let json; let status = 200;
    if (path === '/auth/me') json = { data: { id: 'visual-viewer', role: 'viewer' } };
    else if (path === '/auth/csrf') json = { data: { csrfToken: 'visual-fixture-only' } };
    else if (path.endsWith('/access')) { calls.access++; status = 201; json = { data: { eventId: 'visual-event', duplicate: false } }; }
    else if (path === '/patients') json = { data: [patient], pagination: { hasMore: false, nextCursor: null } };
    else if (path === `/patients/${patient.id}`) json = { data: patient };
    else if (path === '/sessions') json = { data: [{ id: 'demo-session-2', patientId: patient.id, deviceId: 'demo-device-2', assignmentId: 'demo-assignment-2', status: 'active' }], pagination: { hasMore: false, nextCursor: null } };
    else if (path.endsWith('/latest')) { calls.latest++; json = { data: rows[0], meta: { serverTime: new Date().toISOString(), lastSeenAt: new Date().toISOString(), deviceOnline: true, ageMs: 2000, stale: false, connectionState: 'connected_with_recent_reading' } }; }
    else if (path.endsWith('/measurements')) { calls.history++; const older = requestUrl.includes('cursor=older'); json = { data: older ? rows.slice(30) : rows.slice(0, 30), pagination: { hasMore: !older, nextCursor: older ? null : 'older' } }; }
    else { status = 404; json = { error: { code: 'NOT_FOUND', message: 'Fixture sin ruta' } }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:5173/monitoring/demo-patient-a');
  await page.getByRole('heading', { name: patient.displayName, exact: true }).waitFor();
  await page.getByText(/Página 1 · 30 lecturas/).waitFor();
  await page.waitForTimeout(2300);
  if (calls.access !== 1 || calls.latest < 2 || calls.history !== 1) throw new Error(`Polling incorrecto: ${JSON.stringify(calls)}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/evidencias/dashboard-pl2-desktop.png' });
  await page.getByRole('button', { name: 'Más antiguas', exact: true }).click();
  await page.getByText(/Página 2 · 18 lecturas/).waitFor();
  await page.getByRole('button', { name: 'Más recientes', exact: true }).click();
  await page.getByText(/Página 1 · 30 lecturas/).waitFor();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/evidencias/dashboard-pl2-mobile.png' });
  const size = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  if (size.page > size.viewport) throw new Error(`Desbordamiento móvil: ${JSON.stringify(size)}`);
  await page.goto('http://localhost:5173/monitoring');
  await page.getByRole('heading', { name: 'Monitoreo de pacientes', exact: true }).waitFor();
  const stopped = calls.latest;
  await page.waitForTimeout(2300);
  if (calls.latest !== stopped) throw new Error('El polling continúa después de salir del expediente.');
  await page.route('**/api/v1/patients/demo-patient-a/access', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Fixture de permisos' } }) }));
  await page.goto('http://localhost:5173/monitoring/demo-patient-a');
  await page.getByRole('alert').filter({ hasText: 'No tienes permiso' }).waitFor();
  return { fixture: true, desktop: '1280x900', mobile: '375x812', noHorizontalOverflow: true,
    pagination: true, accessOnce: true, pollingStoppedOnExit: true, permissionError: true };
};
