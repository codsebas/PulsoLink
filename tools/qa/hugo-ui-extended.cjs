// Additional real-browser QA. Fault injection aborts requests; no fabricated response data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  if (!process.env.QA_PASSWORD) throw new Error('QA_PASSWORD required');
  const output = path.resolve(process.env.QA_UI_OUTPUT || 'docs/evidencias/hugo-ui-extended');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.QA_BROWSER || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const base = process.env.QA_WEB_URL || 'http://localhost:5173';
  const results = [];
  const check = async (id, expected, fn) => {
    try { const actual = await fn(); results.push({ id, expected, actual: actual || 'Comprobación ejecutada', state: 'PASS' }); }
    catch { results.push({ id, expected, actual: 'Aserción o espera no cumplida; ver captura de fallo', state: 'FAIL' }); await page.screenshot({ path: path.join(output, `${id}-failed.png`) }).catch(() => {}); }
  };
  const historyPattern = '**/api/v1/patients/monitor-patient/measurements*';
  const report = async () => fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), browser: browser.version(), fixture: 'persisted synthetic data; request pause/abort explicitly indicated', results }, null, 2) + '\n');
  try {
    await page.goto(`${base}/login`);
    await page.getByLabel('Correo electrónico').fill(process.env.QA_VIEWER_EMAIL || 'demo-viewer@example.invalid');
    await page.getByLabel('Contraseña', { exact: true }).fill(process.env.QA_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.waitForURL('**/monitoring');
    await page.goto(`${base}/monitoring/monitor-patient`);
    await page.getByText('100 lecturas cargadas', { exact: false }).waitFor();
    const all = []; let cursor;
    do {
      const response = await context.request.get(`${base}/api/v1/patients/monitor-patient/measurements?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      assert.equal(response.status(), 200); const body = await response.json(); all.push(...body.data);
      cursor = body.pagination.hasMore ? body.pagination.nextCursor : null;
    } while (cursor);
    assert.equal(all.length, 240);
    const oldest = Math.min(...all.map(row => Date.parse(row.receivedAt)));
    const from = Math.floor(oldest / 1000) * 1000 + 20000; const to = from + 15000;
    const local = ms => new Date(ms - 6 * 3600000).toISOString().slice(0, 19);
    const fromInput = page.getByLabel('Desde (Guatemala)', { exact: true });
    const toInput = page.getByLabel('Hasta, sin incluir (Guatemala)', { exact: true });
    const expectedRows = all.filter(row => Date.parse(row.receivedAt) >= from && Date.parse(row.receivedAt) < to);
    await check('UI-X01-date-range', 'Fechas Guatemala convertidas a UTC; from inclusivo/to exclusivo y filas coincidentes con API', async () => {
      assert.ok(expectedRows.length > 0 && expectedRows.length < 100);
      await fromInput.fill(local(from)); await toInput.fill(local(to));
      const responsePromise = page.waitForResponse(r => {
        const url = new URL(r.url()); return url.pathname.endsWith('/monitor-patient/measurements') && url.searchParams.get('from') === new Date(from).toISOString() && url.searchParams.get('to') === new Date(to).toISOString();
      });
      await page.getByRole('button', { name: 'Aplicar rango', exact: true }).click();
      assert.equal((await responsePromise).status(), 200);
      await page.getByText(`${expectedRows.length} lecturas cargadas`, { exact: false }).waitFor();
      assert.equal(await page.locator('tbody tr').count(), expectedRows.length);
      await page.screenshot({ path: path.join(output, 'date-range.png') });
      return `${expectedRows.length} filas; límites UTC exactos contrastados con las 240 lecturas persistidas`;
    });
    await check('UI-X02-invalid-range', 'Rechaza from >= to sin enviar ese rango inválido a la API', async () => {
      let count = 0; const listener = req => {
        const url = new URL(req.url());
        if (url.pathname.endsWith('/measurements') && url.searchParams.get('from') === new Date(to + 60000).toISOString()) count++;
      };
      page.on('request', listener);
      try {
        await fromInput.fill(local(to + 60000)); await page.getByRole('button', { name: 'Aplicar rango', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'El inicio debe ser anterior al final.' }).waitFor();
        assert.equal(count, 0);
      } finally { page.off('request', listener); }
      return 'Mensaje de validación visible; 0 peticiones con el rango inválido (polling normal permitido)';
    });
    await check('UI-X03-empty-range', 'Rango futuro muestra vacío, sin reutilizar filas anteriores', async () => {
      await fromInput.fill(local(to + 86400000)); await toInput.fill(local(to + 86460000));
      await page.getByRole('button', { name: 'Aplicar rango', exact: true }).click();
      await page.getByText('No hay lecturas en este intervalo.', { exact: true }).waitFor();
      assert.equal(await page.locator('tbody tr').count(), 0);
    });
    await check('UI-X04-reset-range', 'Desde el inicio registrado limpia filtros y recupera primera página', async () => {
      await page.getByRole('button', { name: 'Desde el inicio registrado', exact: true }).click();
      await page.getByText('100 lecturas cargadas', { exact: false }).waitFor();
      assert.equal(await fromInput.inputValue(), ''); assert.equal(await toInput.inputValue(), '');
      assert.equal(await page.locator('tbody tr').count(), 100);
    });
    await check('UI-X05-loading', 'Estado de carga mientras se retiene la petición HTTP real', async () => {
      let release; const gate = new Promise(resolve => { release = resolve; });
      await page.route(historyPattern, async route => { await gate; await route.continue().catch(() => {}); });
      try {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByText('Cargando historial…', { exact: true }).waitFor();
        await page.screenshot({ path: path.join(output, 'loading.png') });
      } finally { release(); await page.unroute(historyPattern); }
      await page.getByText('100 lecturas cargadas', { exact: false }).waitFor();
      return 'Petición retenida y luego liberada hacia la API, sin sustituir respuesta';
    });
    await check('UI-X06-network-error-recovery', 'Error visible al abortar red y recuperación con Reintentar', async () => {
      await page.route(historyPattern, route => route.abort('failed'));
      try {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByRole('alert').filter({ hasText: 'No fue posible cargar los datos.' }).waitFor();
        assert.equal(await page.locator('tbody tr').count(), 0);
        await page.screenshot({ path: path.join(output, 'network-error.png') });
      } finally { await page.unroute(historyPattern); }
      await page.getByRole('button', { name: 'Reintentar', exact: true }).last().click();
      await page.getByText('100 lecturas cargadas', { exact: false }).waitFor();
      await page.getByRole('heading', { name: 'Evolución e historial' }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, 'network-recovered.png') });
      return 'Red abortada por Playwright; error visible; 100 lecturas recuperadas desde API real';
    });
    await check('UI-X09-later-page-recovery', 'Fallo de página posterior conserva 100 filas; Reintentar recupera 200; archivo sano sin polling completo', async () => {
      await page.reload();
      await page.getByText('100 lecturas cargadas', { exact: false }).waitFor();
      const previousRows = await page.locator('tbody tr').allTextContents();
      await page.route(historyPattern, route => new URL(route.request().url()).searchParams.has('cursor') ? route.abort('failed') : route.continue());
      try {
        await page.getByRole('button', { name: 'Cargar más antiguas' }).click();
        await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
        assert.deepEqual(await page.locator('tbody tr').allTextContents(), previousRows);
      } finally { await page.unroute(historyPattern); }
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
      await page.getByText('200 lecturas cargadas', { exact: false }).waitFor();
      const restored = await page.locator('tbody tr').allTextContents();
      assert.ok(previousRows.every(row => restored.includes(row)));
      let archives = 0; let live = 0;
      const listener = request => { const u = new URL(request.url()); if (u.pathname.endsWith('/monitor-patient/measurements')) { if (u.searchParams.get('limit') === '100') archives++; else live++; } };
      page.on('request', listener);
      await page.getByRole('button', { name: 'Refrescar lecturas recientes' }).click();
      await page.waitForTimeout(11000);
      page.off('request', listener);
      assert.equal(archives, 0); assert.ok(live >= 1);
      await page.screenshot({ path: path.join(output, 'later-page-recovered.png') });
      return '100 filas conservadas durante el fallo; 200 después; 0 peticiones de archivo durante refresco y 11 s de observación';
    });
    await check('UI-X07-logout', 'Salir elimina sesión y contenido del paciente; /auth/me devuelve 401', async () => {
      const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/logout');
      await page.getByRole('button', { name: 'Salir', exact: true }).click();
      assert.equal((await responsePromise).status(), 204);
      await page.waitForURL('**/login');
      assert.equal(await page.getByRole('heading', { name: 'Paciente seudónimo de monitoreo' }).count(), 0);
      assert.equal(await page.locator('tbody tr').count(), 0);
      assert.ok(!(await context.cookies()).some(cookie => cookie.name === 'pulsolink_session' && cookie.value));
      assert.equal((await context.request.get(`${base}/api/v1/auth/me`)).status(), 401);
    });
    await check('UI-X08-back-after-logout', 'Atrás y acceso directo protegido no muestran historia tras salir', async () => {
      await page.goBack({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('tbody tr').count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Paciente seudónimo de monitoreo' }).count(), 0);
      await page.goto(`${base}/monitoring/monitor-patient`);
      await page.waitForURL('**/login');
      await page.getByRole('heading', { name: 'Acceso a PulsoLink' }).waitFor();
      assert.equal(await page.locator('tbody tr').count(), 0);
      await page.screenshot({ path: path.join(output, 'logged-out.png') });
    });
  } catch {
    results.push({ id: 'UI-X00-setup', expected: 'Login y fixture disponible', actual: 'Flujo interrumpido antes de completar casos', state: 'FAIL' });
    await page.locator('input[type=password]').fill('').catch(() => {});
    await page.screenshot({ path: path.join(output, 'setup-failed.png') }).catch(() => {});
  } finally { await report(); console.log(JSON.stringify(results)); await browser.close(); }
  process.exitCode = results.some(r => r.state === 'FAIL') ? 1 : 0;
}
main().catch(() => { console.error('UI extendida no disponible: revisar navegador, fixture y API.'); process.exitCode = 1; });
