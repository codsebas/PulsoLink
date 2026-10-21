// Run against disposable local fixtures; install Playwright separately (see QA guide).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  if (!process.env.QA_PASSWORD) throw new Error('QA_PASSWORD required');
  const output = path.resolve(process.env.QA_UI_OUTPUT || 'docs/evidencias/hugo-ui');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.QA_BROWSER || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const base = process.env.QA_WEB_URL || 'http://localhost:5173';
  const results = [];
  const check = async (id, fn) => {
    try { await fn(); results.push({ id, state: 'PASS' }); }
    catch { results.push({ id, state: 'FAIL' }); }
  };
  try {
    await page.goto(`${base}/login`);
    await page.getByLabel('Correo electrónico').fill(process.env.QA_VIEWER_EMAIL || 'demo-viewer@example.invalid');
    await page.getByLabel('Contraseña', { exact: true }).fill(process.env.QA_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.waitForURL('**/monitoring', { timeout: 15000 });
    await check('UI-H01-login-viewer', async () => { await page.getByRole('heading', { name: 'Monitoreo de pacientes' }).waitFor(); });
    await page.goto(`${base}/monitoring/monitor-patient`);
    await page.getByText('100 lecturas cargadas', { exact: false }).waitFor();
    await check('UI-H02-partial-coverage', async () => { assert.match(await page.locator('main').last().innerText(), /Hay datos más antiguos por cargar/); });
    await page.getByRole('button', { name: 'Cargar más antiguas' }).click();
    await page.getByText('200 lecturas cargadas', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Cargar más antiguas' }).click();
    await page.getByText('240 lecturas cargadas', { exact: false }).waitFor();
    await check('UI-H03-complete-two-boards', async () => {
      const text = await page.locator('main').last().innerText();
      assert.match(text, /Alcanzaste el inicio del intervalo consultado/);
      assert.match(text, /monitor-device-1/); assert.match(text, /monitor-device-2/);
      assert.equal(await page.locator('tbody tr').count(), 240);
    });
    await check('UI-H04-null-not-zero', async () => {
      const cells = page.locator('tbody td').filter({ hasText: 'Sin contacto' });
      assert.ok(await cells.count() > 0);
      for (const text of await cells.allTextContents()) assert.match(text, /^—/);
    });
    await check('UI-H05-stale-and-simulated', async () => {
      const text = await page.locator('main').last().innerText();
      assert.match(text, /Desconectado/); assert.match(text, /Datos simulados/); assert.match(text, /Sin lectura reciente/);
    });
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await check(`UI-H06-width-${width}`, async () => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); });
      await page.screenshot({ path: path.join(output, `monitoring-${width}.png`), fullPage: false });
    }
    await check('UI-H07-keyboard-controls', async () => {
      await page.getByRole('button', { name: 'Actualizar', exact: true }).focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'INPUT');
    });
    await page.reload();
    await page.getByText('100 lecturas cargadas', { exact: false }).waitFor();
    await check('UI-H08-history-after-reload', async () => { assert.equal(await page.locator('tbody tr').count(), 100); });
    await page.goto(`${base}/monitoring/demo-patient-b`);
    await check('UI-H09-empty-patient', async () => { await page.getByText('No hay lecturas en este intervalo.', { exact: true }).waitFor(); });
    await page.goto(`${base}/patients`);
    await check('UI-H10-viewer-no-create', async () => {
      await page.getByRole('heading', { name: 'Pacientes', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: /Crear paciente|Nuevo paciente/ }).count(), 0);
    });
    const cookie = (await context.cookies()).filter(c => c.name === 'pulsolink_session').map(c => `${c.name}=${c.value}`).join('; ');
    // Pass session only through child environment; never write it into reports.
    if (process.env.QA_RUN_WEB_TESTS === 'true') {
      const { spawnSync } = require('node:child_process');
      const test = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--root', 'apps/web'], { stdio: 'inherit', env: { ...process.env, PULSOLINK_API_URL: 'http://localhost:3001', PULSOLINK_SESSION_COOKIE: cookie, PULSOLINK_PATIENT_ID: 'monitor-patient' } });
      results.push({ id: 'UI-H11-web-suite-real-api', state: test.status === 0 ? 'PASS' : 'FAIL' });
    }
  } catch {
    results.push({ id: 'UI-H00-flow-interrupted', state: 'FAIL' });
    // Screenshot only after clearing password inputs.
    await page.locator('input[type=password]').fill('').catch(() => {});
    await page.screenshot({ path: path.join(output, 'interrupted.png') }).catch(() => {});
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), browser: browser.version(), fixture: 'seed-simulator-qa; synthetic persisted history', results }, null, 2) + '\n');
    console.log(JSON.stringify(results));
    await browser.close();
  }
  process.exitCode = results.some(r => r.state === 'FAIL') ? 1 : 0;
}
main().catch(() => { console.error('UI QA could not run; check local browser, API and fixture environment.'); process.exitCode = 1; });
