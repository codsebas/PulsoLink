const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async function dashboardAcceptance({ page, output }) {
  const results = [];
  for (const [width, height] of [[360, 800], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('article', { name: 'Pulso', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}`);
    // #74: por debajo de `lg` la navegación vive en un menú desplegable; se abre antes de recorrerla.
    const menu = page.getByRole('button', { name: 'Menú', exact: true });
    const openedMenu = await menu.isVisible() && await menu.getAttribute('aria-expanded') === 'false';
    if (openedMenu) await menu.click();
    const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
    const links = nav.getByRole('link');
    await links.first().focus();
    await page.keyboard.press('Tab'); // Enter keyboard modality before checking :focus-visible.
    for (let i = 0; i < await links.count(); i++) {
      assert(await page.evaluate(() => document.activeElement?.matches('a, button')), `Keyboard focus lost at ${width}/${i}`);
      assert(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'), `Focus outline absent at ${width}/${i}`);
      await page.keyboard.press('Tab');
    }
    await page.screenshot({ path: path.join(output, `dashboard-${width}.png`) });
    if (openedMenu) {
      // Con el menú abierto el resto de la página queda inerte: cerrarlo con Escape antes del siguiente ancho.
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false', `Menu did not close with Escape at ${width}`);
    }
    results.push(`viewport-${width}x${height}-overflow-keyboard`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert(await page.locator('header .animate-pulse').evaluate(el => getComputedStyle(el).animationName === 'none'), 'Reduced motion: pulse remains animated');
  assert(await page.locator('header .animate-ping').evaluate(el => getComputedStyle(el).animationName === 'none'), 'Reduced motion: ping remains animated');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  results.push('computed-reduced-motion');
  await page.getByRole('region', { name: 'Tabla de lecturas, desplazamiento horizontal' }).focus();
  assert(await page.getByRole('region', { name: 'Tabla de lecturas, desplazamiento horizontal' }).evaluate(el => el === document.activeElement));
  results.push('keyboard-scrollable-history');
  // Fault injection aborts the actual request; no response or data are fabricated.
  await page.reload();
  await page.getByText(/100 lecturas cargadas en 1 página:/).waitFor();
  const before = await page.locator('tbody tr').count();
  const pattern = '**/api/v1/patients/monitor-patient/measurements*';
  await page.route(pattern, route => new URL(route.request().url()).searchParams.has('cursor') ? route.abort() : route.continue());
  try {
    await page.getByRole('button', { name: 'Cargar más antiguas', exact: true }).click();
    await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), before);
  } finally { await page.unroute(pattern); }
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await page.waitForFunction(count => document.querySelectorAll('tbody tr').length > count, before);
  results.push('aborted-cursor-preserves-rows-retry-recovers');
  return results;
};
