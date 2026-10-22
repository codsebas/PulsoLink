// Ejecutar: node --test tools/qa/ui-responsive-compare.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compareAudits, toMarkdown } = require('./ui-responsive-compare.cjs');

const row = (route, width, overrides = {}) => ({
  role: 'admin', route, width, horizontalOverflowPx: 0, smallTargets: 10, interactiveTargets: 12, headerHeightPx: 149,
  tablesNeedingHorizontalScroll: 1, tinyTextElements: 0, pageHeightPx: 1000, h1Count: 1, ...overrides,
});
const audit = (commit, results) => ({ commit, checkedAt: '2026-10-22T00:00:00Z', results });

test('detecta mejoras y regresiones por ruta y ancho', () => {
  const before = audit('aaaaaaa1', [row('/patients', 360), row('/devices', 360)]);
  const after = audit('bbbbbbb2', [row('/patients', 360, { headerHeightPx: 56, smallTargets: 2 }), row('/devices', 360, { horizontalOverflowPx: 30 })]);
  const c = compareAudits(before, after);
  assert.equal(c.improvements, 2);
  assert.equal(c.regressions, 1);
  const devices = c.rows.find(r => r.route === '/devices');
  assert.equal(devices.metrics.find(m => m.key === 'horizontalOverflowPx').regression, true);
});

test('la altura de página es informativa y no cuenta como regresión', () => {
  const c = compareAudits(audit('a', [row('/', 360)]), audit('b', [row('/', 360, { pageHeightPx: 9000 })]));
  assert.equal(c.regressions, 0);
  assert.equal(c.rows[0].changed, true);
});

test('perder el h1 único es una regresión', () => {
  const c = compareAudits(audit('a', [row('/', 360)]), audit('b', [row('/', 360, { h1Count: 0 })]));
  assert.equal(c.regressions, 1);
  assert.match(toMarkdown(c), /⚠️ h1/);
});

test('informa rutas nuevas y ausentes', () => {
  const c = compareAudits(audit('a', [row('/old', 360)]), audit('b', [row('/new', 360)]));
  assert.deepEqual(c.missing.map(m => m.route), ['/old']);
  assert.equal(c.rows[0].status, 'nueva');
  const md = toMarkdown(c);
  assert.match(md, /nueva/);
  assert.match(md, /ausentes después: 360 `\/old`/);
});

test('el Markdown solo lista filas con cambios salvo --all', () => {
  const before = audit('aaaaaaa1', [row('/patients', 360), row('/devices', 360)]);
  const after = audit('bbbbbbb2', [row('/patients', 360, { headerHeightPx: 56 }), row('/devices', 360)]);
  const md = toMarkdown(compareAudits(before, after));
  assert.match(md, /`aaaaaaa` → `bbbbbbb` — 1 mejoras, 0 regresiones/);
  assert.match(md, /149 → 56 \(−93\) ✅/);
  assert.doesNotMatch(md, /`\/devices`/);
  assert.match(toMarkdown(compareAudits(before, after), { all: true }), /`\/devices`/);
});

test('sin cambios lo dice explícitamente', () => {
  const same = audit('a', [row('/', 360)]);
  assert.match(toMarkdown(compareAudits(same, same)), /Sin cambios en las métricas medidas/);
});
