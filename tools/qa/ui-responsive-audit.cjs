// PL2-14 (#74): auditoría responsiva reproducible para comparar versiones del frontend.
// Runs only inside the disposable-emulator verifier (PULSOLINK_RESPONSIVE_AUDIT=true); no credentials are saved.
// Mide por ruta y ancho: desbordamiento horizontal, controles menores de 44 px, altura de cabecera,
// tablas que obligan a desplazar, textos menores de 12 px y altura de página. No juzga: registra.
const fs = require('node:fs');
const path = require('node:path');

const ROUTES = ['/', '/monitoring', '/monitoring/monitor-patient', '/patients', '/devices', '/assignments', '/sessions', '/admin/users', '/admin/audit'];
const VIEWPORTS = [[360, 800], [768, 1024], [1440, 900]];
const MIN_TARGET_PX = 44;
const MIN_FONT_PX = 12;

// Se ejecuta en el navegador; no lee contenido de pacientes, solo geometría y etiquetas de controles.
function measurePage({ minTarget, minFont }) {
  const vw = window.innerWidth;
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const label = el => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.id || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const clipped = el => { for (let p = el.parentElement; p; p = p.parentElement) { if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true; } return false; };
  const all = [...document.querySelectorAll('body *')].filter(visible);
  const overflowing = all.filter(el => el.getBoundingClientRect().right > vw + 1 && !clipped(el));
  const targets = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button]')].filter(visible);
  const small = targets.filter(el => { const r = el.getBoundingClientRect(); return r.width < minTarget || r.height < minTarget; });
  const tables = [...document.querySelectorAll('table')].filter(visible).map(t => {
    let scroller = t.parentElement;
    while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
    const container = scroller ? scroller.clientWidth : vw;
    return { width: Math.round(t.scrollWidth), container, scrollable: Boolean(scroller), needsHorizontalScroll: t.scrollWidth > container + 1 };
  });
  const tinyText = all.filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < minFont).length;
  const header = document.querySelector('header');
  return {
    horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - vw),
    overflowingElements: overflowing.slice(0, 5).map(el => `${el.tagName.toLowerCase()} "${label(el)}"`),
    interactiveTargets: targets.length,
    smallTargets: small.length,
    smallTargetSamples: small.slice(0, 5).map(el => { const r = el.getBoundingClientRect(); return `${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`; }),
    headerHeightPx: header ? Math.round(header.getBoundingClientRect().height) : null,
    headerSticky: header ? ['sticky', 'fixed'].includes(getComputedStyle(header).position) : null,
    h1Count: document.querySelectorAll('h1').length,
    tables,
    tablesNeedingHorizontalScroll: tables.filter(t => t.needsHorizontalScroll).length,
    tinyTextElements: tinyText,
    pageHeightPx: document.documentElement.scrollHeight,
  };
}

async function signIn(browser, origin, email, password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  await page.goto(origin + '/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL('**/monitoring');
  return { context, page };
}

module.exports = async function uiResponsiveAudit({ browser, origin, password, output, screenshots = 'viewport', screenshotWidths = null, settleMs = 2500 }) {
  fs.mkdirSync(output, { recursive: true });
  const shotsDir = path.join(output, 'screenshots');
  if (screenshots !== 'none') fs.mkdirSync(shotsDir, { recursive: true });
  const shoot = async (page, name, width) => {
    if (screenshots === 'none' || (screenshotWidths && !screenshotWidths.includes(width))) return null;
    const file = `${name}.png`;
    await page.screenshot({ path: path.join(shotsDir, file), fullPage: screenshots === 'full' });
    return `screenshots/${file}`;
  };
  const results = [];
  const measure = page => page.evaluate(measurePage, { minTarget: MIN_TARGET_PX, minFont: MIN_FONT_PX });
  const { context, page } = await signIn(browser, origin, 'demo-admin@example.invalid', password);
  try {
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      for (const route of ROUTES) {
        await page.goto(origin + route);
        await page.locator('main').first().waitFor();
        // Las vistas con polling nunca quedan "idle": se espera un intervalo fijo para que carguen datos.
        await page.waitForTimeout(settleMs);
        const metrics = await measure(page);
        const screenshot = await shoot(page, `${width}${route === '/' ? '_home' : route.replace(/\//g, '_')}`, width);
        results.push({ role: 'admin', route, width, height, ...metrics, screenshot });
      }
    }
  } finally { await context.close(); }
  const anon = await browser.newContext({ viewport: { width: 360, height: 800 } });
  try {
    const login = await anon.newPage(); login.setDefaultTimeout(20000);
    await login.goto(origin + '/login');
    await login.locator('main').first().waitFor();
    await login.waitForTimeout(1000);
    results.push({ role: 'anónimo', route: '/login', width: 360, height: 800, ...(await measure(login)), screenshot: await shoot(login, '360_login', 360) });
  } finally { await anon.close(); }
  return { thresholds: { minTargetPx: MIN_TARGET_PX, minFontPx: MIN_FONT_PX }, results };
};
module.exports.ROUTES = ROUTES;
module.exports.VIEWPORTS = VIEWPORTS;
