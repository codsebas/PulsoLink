// Real browser + local API + Auth/Firestore emulators. No HTTP fixtures.
// Run only inside firebase emulators:exec with a disposable demo- project.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');
let step = 'setup';
const secrets = [];

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  assert(projectId?.startsWith('demo-'), 'Only a disposable demo- project is allowed.');
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    assert(/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[name] ?? ''), 'Local emulators required.');
  }
  const packagePath = (process.env.PATH ?? '').split(path.delimiter)
    .map((entry) => path.resolve(entry, '..', 'playwright'))
    .find((entry) => fs.existsSync(path.join(entry, 'package.json')));
  const { chromium } = require(packagePath ?? 'playwright');
  const root = path.resolve(__dirname, '../..');
  const origin = 'http://localhost:15173';
  const api = 'http://127.0.0.1:13001';
  const environment = { ...process.env, NODE_ENV: 'development', PORT: '13001',
    CORS_ORIGIN: origin, COOKIE_SECURE: 'false', FIREBASE_WEB_API_KEY: 'emulator',
    CSRF_SECRET: randomBytes(32).toString('hex'), VITE_API_PROXY_TARGET: api, VITE_API_BASE_URL: '/api/v1' };
  const children = [];
  let browser;
  try {
    for (const url of [`${api}/api/v1/health`, origin]) {
      let occupied = false;
      try { await fetch(url, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
      assert(!occupied, 'A verification port is already occupied; no existing server was reused.');
    }
    children.push(spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/server.ts'],
      { cwd: root, env: environment, windowsHide: true, stdio: 'ignore' }));
    children.push(spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', '15173', '--strictPort'],
      { cwd: path.join(root, 'apps/web'), env: environment, windowsHide: true, stdio: 'ignore' }));
    for (const url of [`${api}/api/v1/health`, origin]) {
      let ready = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      assert(ready, 'Local verification server did not become ready.');
    }
    admin.initializeApp({ projectId });
    const identity = admin.auth();
    const db = admin.firestore();
    const password = randomBytes(24).toString('base64url');
    secrets.push(password);
    const prefix = randomUUID();
    const accounts = {};
    for (const role of ['admin', 'viewer']) {
      const email = `browser-${role}-${prefix}@example.invalid`;
      secrets.push(email);
      const user = await identity.createUser({ email, password, displayName: `Browser ${role}` });
      await db.collection('users').doc(user.uid).set({ uid: user.uid, role, displayName: `Browser ${role}`,
        enabled: true, createdAt: new Date().toISOString() });
      accounts[role] = { email, uid: user.uid };
    }
    // Use the installed Chrome; no headed window or browser download.
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(15000);
    const login = async (role) => {
      await page.getByLabel('Correo electrónico', { exact: true }).fill(accounts[role].email);
      await page.getByLabel('Contraseña', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    };
    step = 'anonymous redirect and admin login';
    await page.goto(`${origin}/admin/users`);
    await page.waitForURL('**/login');
    step = 'admin login and return';
    await login('admin');
    await page.waitForURL('**/admin/users');
    await page.getByRole('heading', { name: 'Usuarios', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Monitoreo', exact: true }).count(), 1);
    step = 'create user';
    await page.getByRole('button', { name: 'Nuevo usuario', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo usuario', exact: true });
    const email = `browser-created-${prefix}@example.invalid`;
    const displayName = `Prueba ${prefix.slice(0, 8)}`;
    await dialog.getByLabel('Correo electrónico').fill(email);
    await dialog.getByLabel('Contraseña').fill(password);
    await dialog.getByLabel('Nombre visible').fill(displayName);
    await dialog.getByRole('button', { name: 'Crear usuario', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    let row = page.getByRole('row').filter({ hasText: displayName });
    await row.waitFor();
    const created = await identity.getUserByEmail(email);
    assert.equal((await db.collection('users').doc(created.uid).get()).data().role, 'viewer');
    step = 'change role';
    await row.getByRole('button', { name: 'Editar', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Editar usuario', exact: true });
    await edit.getByLabel('Rol').selectOption('admin');
    await edit.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await edit.waitFor({ state: 'hidden' });
    assert.equal((await db.collection('users').doc(created.uid).get()).data().role, 'admin');
    step = 'disable user';
    await row.getByRole('button', { name: 'Deshabilitar', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Deshabilitar', exact: true }).click();
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    await page.getByLabel('Estado', { exact: true }).selectOption('false');
    await row.waitFor();
    assert.equal((await identity.getUser(created.uid)).disabled, true);
    step = 'audit screen';
    await page.getByRole('link', { name: 'Auditoría', exact: true }).click();
    await page.getByRole('heading', { name: 'Auditoría', exact: true }).waitFor();
    await page.getByLabel('Acción', { exact: true }).fill('user.create');
    await page.getByRole('cell', { name: 'user.create', exact: true }).first().waitFor();
    assert.equal((await db.collection('auditLogs').where('targetId', '==', created.uid)
      .where('action', '==', 'user.create').get()).size, 1);
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await page.waitForURL('**/login');
    await page.goto(`${origin}/admin/users`);
    await page.waitForURL('**/login');
    step = 'viewer permissions';
    await login('viewer');
    await page.waitForURL('**/admin/users');
    await page.getByRole('heading', { name: 'Acceso restringido', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Usuarios', exact: true }).count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Auditoría', exact: true }).count(), 0);
    assert.equal((await page.request.get(`${origin}/api/v1/users`)).status(), 403);
    assert.equal((await page.request.get(`${origin}/api/v1/audit-logs`)).status(), 403);
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await page.waitForURL('**/login');
    step = 'accessible error and mobile login';
    await page.getByLabel('Correo electrónico', { exact: true }).fill(accounts.admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill('incorrect-password');
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert(await page.getByRole('alert').evaluate((element) => element === document.activeElement));
    await page.setViewportSize({ width: 375, height: 812 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    console.log('AUTH_UI_OK: login return, create, change role, disable, audit, logout, viewer 403, accessible error, mobile login. Real local API and emulators; no fixtures.');
  } finally {
    if (browser) await browser.close();
    for (const child of children) if (child.pid && child.exitCode === null) child.kill();
    await Promise.all(admin.apps.map((app) => app.delete()));
  }
}

main().catch((error) => {
  // Avoid printing request bodies, test credentials or browser DOM snapshots.
  console.error(`AUTH_UI_FAILED at ${step}; no credentials were logged.`);
  let message = String(error.message ?? error);
  for (const secret of secrets) message = message.split(secret).join('[redacted]');
  console.error(message.slice(0, 1600));
  process.exitCode = 1;
});
