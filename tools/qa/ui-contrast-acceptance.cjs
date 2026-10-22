// PL2-08 sección E (matriz de Axel): contraste API ↔ web en navegador real.
// Runs only inside the disposable-emulator verifier; no credentials are saved or printed.
// UI-01, UI-04, UI-05 y UI-08 ya los cubre el verificador de #33 (PR #61); aquí se ejecutan los restantes.
const { randomBytes } = require('node:crypto');

const CONFLICT_TEXT = 'El paciente o la placa ya tienen una asignación activa. Cierra la asignación existente antes de crear otra.';
const IN_USE_TEXT = 'La asignación tiene sesiones abiertas. Finaliza las sesiones antes de cerrar o deshabilitar.';
const normalize = text => text.replace(/[\s  ]+/g, ' ').trim();

module.exports = async function uiContrastAcceptance({ browser, origin, password }) {
  const results = [];
  const record = (id, expected, actual, pass) => results.push({ id, expected, actual, state: pass ? 'PASS' : 'FAIL' });
  const skip = (id, expected, why) => results.push({ id, expected, actual: why, state: 'SKIPPED' });
  const run = randomBytes(3).toString('hex');
  const contexts = [];

  async function signIn(email, landing) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    await page.goto(origin + '/login');
    await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.waitForURL('**/' + landing);
    return page;
  }
  async function attempt(id, expected, body) {
    try { await body(); }
    catch (error) {
      // Only the failing case and a controlled category are recorded: page errors can carry session data.
      record(id, expected, `Sin completar (${error?.name === 'TimeoutError' ? 'tiempo de espera agotado' : 'error del navegador'})`, false);
    }
  }

  try {
    // Recursos ficticios creados por la API real con la sesión admin del navegador.
    const admin = await signIn('demo-admin@example.invalid', 'monitoring');
    const csrf = (await (await admin.request.get(origin + '/api/v1/auth/csrf')).json()).data.csrfToken;
    const call = async (route, method, data, expected) => {
      const r = await admin.request.fetch(origin + '/api/v1' + route, { method, data, headers: { Origin: origin, 'X-CSRF-Token': csrf } });
      if (r.status() !== expected) throw new Error(`Preparación ${method} ${route.split('/')[1]}: HTTP ${r.status()}`);
      return (await r.json()).data;
    };
    const p1 = await call('/patients', 'POST', { code: `UI-AX-${run}-1`, displayName: `Paciente ficticio UI ${run} uno` }, 201);
    const p2 = await call('/patients', 'POST', { code: `UI-AX-${run}-2`, displayName: `Paciente ficticio UI ${run} dos` }, 201);
    const device = await call('/devices', 'POST', { code: `UI-AX-${run}-D`, source: 'simulated' }, 201);
    const assignment = await call('/assignments', 'POST', { patientId: p1.id, deviceId: device.id }, 201);

    // UI-03a: 409 ASSIGNMENT_CONFLICT al asignar una placa ocupada desde el formulario.
    await attempt('UI-03a', '409 ASSIGNMENT_CONFLICT de la API y mensaje accionable en el diálogo', async () => {
      await admin.goto(origin + '/assignments');
      await admin.getByRole('button', { name: 'Asignar placa', exact: true }).click();
      const dialog = admin.getByRole('dialog');
      await dialog.locator('#assignment-patient').selectOption(p2.id);
      await dialog.locator('#assignment-device').selectOption(device.id);
      const response = admin.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/assignments' && r.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Asignar', exact: true }).click();
      const r = await response;
      const code = (await r.json().catch(() => null))?.error?.code;
      await dialog.getByRole('alert').getByText(CONFLICT_TEXT, { exact: true }).waitFor({ timeout: 5000 });
      record('UI-03a', '409 ASSIGNMENT_CONFLICT de la API y mensaje accionable en el diálogo', `HTTP ${r.status()} ${code}; mensaje visible`, r.status() === 409 && code === 'ASSIGNMENT_CONFLICT');
    });

    // UI-03b: 409 ASSIGNMENT_IN_USE al abrir una segunda sesión en la misma asignación.
    await call('/sessions', 'POST', { assignmentId: assignment.id }, 201);
    await attempt('UI-03b', '409 ASSIGNMENT_IN_USE de la API y mensaje accionable en el diálogo', async () => {
      await admin.goto(origin + '/sessions');
      await admin.getByRole('button', { name: 'Nueva Sesión', exact: true }).click();
      const dialog = admin.getByRole('dialog');
      await dialog.locator('#session-assignment').selectOption(assignment.id);
      const response = admin.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/sessions' && r.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Crear sesión', exact: true }).click();
      const r = await response;
      const code = (await r.json().catch(() => null))?.error?.code;
      await dialog.getByRole('alert').getByText(IN_USE_TEXT, { exact: true }).waitFor({ timeout: 5000 });
      record('UI-03b', '409 ASSIGNMENT_IN_USE de la API y mensaje accionable en el diálogo', `HTTP ${r.status()} ${code}; mensaje visible`, r.status() === 409 && code === 'ASSIGNMENT_IN_USE');
    });
    // DEVICE_BUSY solo se produce si la placa ya reserva otra sesión; en el modelo 2.0 la asignación exclusiva
    // por placa y la sesión abierta única por asignación lo impiden antes (ASSIGNMENT_CONFLICT/ASSIGNMENT_IN_USE).
    skip('UI-03c', 'Mensaje para 409 DEVICE_BUSY', 'No alcanzable desde la web con el modelo 2.0: se rechaza antes con ASSIGNMENT_CONFLICT o ASSIGNMENT_IN_USE (CON-10, CONC-04).');

    // UI-07: la API entrega UTC y la web muestra America/Guatemala.
    await attempt('UI-07', 'Inicio de la asignación en hora de America/Guatemala, no en UTC', async () => {
      await admin.goto(origin + '/assignments');
      // El nombre también aparece en <option> ocultos de los filtros: se espera la fila de la tabla.
      await admin.locator('tbody').getByText(p1.id, { exact: true }).first().waitFor();
      const format = timeZone => normalize(new Intl.DateTimeFormat('es-GT', { dateStyle: 'short', timeStyle: 'medium', timeZone }).format(new Date(assignment.startedAt)));
      const local = format('America/Guatemala');
      const utc = format('UTC');
      const text = normalize(await admin.locator('tbody').innerText());
      record('UI-07', 'Inicio de la asignación en hora de America/Guatemala, no en UTC',
        `API ${assignment.startedAt}; esperado "${local}" visible=${text.includes(local)}; UTC "${utc}" visible=${text.includes(utc)}`,
        utc !== local && text.includes(local) && !text.includes(utc));
    });

    // UI-02: un 401 durante el polling del dashboard lleva a /login y deja de mostrar el expediente.
    await attempt('UI-02', 'Sesión perdida durante el polling: redirección a /login sin datos del expediente', async () => {
      const viewer = await signIn('demo-viewer@example.invalid', 'monitoring');
      await viewer.goto(origin + '/monitoring/monitor-patient');
      await viewer.getByRole('heading', { name: 'Paciente seudónimo de monitoreo', exact: true }).waitFor();
      const lost = Date.now();
      await viewer.context().clearCookies();
      let redirected = true;
      try { await viewer.waitForURL('**/login', { timeout: 15000 }); } catch { redirected = false; }
      const elapsed = Date.now() - lost;
      const heading = await viewer.getByRole('heading', { name: 'Paciente seudónimo de monitoreo', exact: true }).count();
      record('UI-02', 'Sesión perdida durante el polling: redirección a /login sin datos del expediente',
        `redirigida=${redirected} en ${redirected ? `${Math.round(elapsed / 100) / 10} s` : 'más de 15 s'}; expediente visible=${heading > 0}`, redirected && heading === 0);
    });

    // UI-06: tras cerrar sesión, volver atrás no muestra datos del paciente.
    await attempt('UI-06', 'Tras Salir, el botón Atrás no muestra datos del expediente', async () => {
      const viewer = await signIn('demo-viewer@example.invalid', 'monitoring');
      await viewer.goto(origin + '/monitoring/monitor-patient');
      await viewer.getByRole('heading', { name: 'Paciente seudónimo de monitoreo', exact: true }).waitFor();
      await viewer.getByRole('button', { name: 'Salir', exact: true }).click();
      await viewer.waitForURL('**/login');
      await viewer.goBack();
      await viewer.waitForTimeout(2500);
      const onLogin = new URL(viewer.url()).pathname === '/login';
      const heading = await viewer.getByRole('heading', { name: 'Paciente seudónimo de monitoreo', exact: true }).count();
      const rows = await viewer.getByText(/lecturas cargadas/).count();
      record('UI-06', 'Tras Salir, el botón Atrás no muestra datos del expediente',
        `ruta=${onLogin ? '/login' : 'otra'}; expediente visible=${heading > 0}; historial visible=${rows > 0}`, onLogin && heading === 0 && rows === 0);
    });
  } catch (error) {
    results.push({ id: 'UI-PREP', expected: 'Preparación de datos ficticios por la API real', actual: String(error?.message ?? '').startsWith('Preparación') ? error.message : 'Preparación sin completar (error del navegador)', state: 'FAIL' });
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
  }
  return results;
};
