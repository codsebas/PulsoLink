#!/usr/bin/env node
'use strict';

/**
 * Puerta local de aceptación de la continuidad del historial (criterios QA
 * HIST-01 e HIST-02 de #31 PL2-07 y #29 PL2-05).
 *
 * Es el complemento sin dependencias de `tools/qa/hugo-history-acceptance.cjs`:
 * ese script reproduce el recorrido contra el backend y el navegador reales y
 * necesita un entorno en vivo; este verifica los mismos criterios sobre la
 * capa de datos del frontend, con el modelo de servidor del historial, para
 * que se pueda ejecutar en CI y en cada pull request.
 *
 * Uso:
 *   node tools/qa/history-continuity-acceptance.cjs
 *
 * Salida: 0 cuando la aceptación está aprobada; 1 cuando algún criterio falla.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const webDir = path.join(root, 'apps', 'web');
const spec = path.join('test', 'history-acceptance.test.ts');

/** Criterios de aceptación y cómo se reconoce cada uno en la salida de vitest. */
const CRITERIA = [
  { id: 'HIST-01', title: 'La ventana en vivo recupera el tramo perdido y no deja huecos', match: 'HIST-01' },
  { id: 'HIST-02', title: 'La paginación alcanza el inicio real sin recortar lo cargado', match: 'HIST-02' },
];

/** Comprobaciones estáticas: impiden reintroducir los defectos ya corregidos. */
const STATIC_CHECKS = [
  {
    id: 'STATIC-01',
    title: 'El historial acumulado no se recorta al fusionar (hooks.ts)',
    file: path.join('apps', 'web', 'src', 'features', 'patient-monitoring', 'hooks.ts'),
    forbiddenPatterns: [/slice\(\s*0\s*,\s*(MAX_HISTORY_SAMPLES|\d+)\s*\)/],
  },
  {
    id: 'STATIC-02',
    title: 'La navegación conserva las páginas que la persona usuaria abrió (history.ts)',
    file: path.join('apps', 'web', 'src', 'features', 'patient-monitoring', 'history.ts'),
    required: ['visitedFrom', 'olderHistoryWindow'],
    forbiddenPatterns: [/retained\.shift\(\)/],
  },
  {
    id: 'STATIC-03',
    title: 'El refresco en vivo recupera el tramo perdido (history.ts)',
    file: path.join('apps', 'web', 'src', 'features', 'patient-monitoring', 'history.ts'),
    required: ['recentHistoryWindow'],
  },
];

function fail(message) {
  console.error(`\n[ACCEPTACIÓN HISTORIAL] FALLO: ${message}`);
  process.exit(1);
}

function runStaticChecks() {
  for (const check of STATIC_CHECKS) {
    const file = path.join(root, check.file);
    if (!fs.existsSync(file)) fail(`no existe ${check.file}`);
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of check.forbiddenPatterns ?? []) {
      if (pattern.test(source)) fail(`${check.id}: ${check.file} vuelve a aplicar «${pattern.source}»`);
    }
    for (const required of check.required ?? []) {
      if (!source.includes(required)) fail(`${check.id}: ${check.file} ya no contiene «${required}»`);
    }
    console.log(`  [OK] ${check.id}  ${check.title}`);
  }
}

function runAcceptance() {
  let vitestBin;
  try {
    vitestBin = require.resolve('vitest/vitest.mjs');
  } catch {
    fail('no se encuentra vitest; ejecuta `npm install` en la raíz del repositorio');
  }
  const report = path.join(os.tmpdir(), `pulsolink-continuidad-historial-${process.pid}.json`);
  const result = spawnSync(
    process.execPath,
    [vitestBin, 'run', spec, '--reporter=json', `--outputFile=${report}`],
    { cwd: webDir, encoding: 'utf8' }
  );
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(report, 'utf8'));
  } catch {
    /* el informe se informa abajo con la salida del proceso hijo */
  } finally {
    if (fs.existsSync(report)) fs.unlinkSync(report);
  }
  if (!parsed) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    fail(`la suite de aceptación no produjo informe (código ${result.status})`);
  }
  const assertions = (parsed.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
  for (const criterion of CRITERIA) {
    const found = assertions.find((assertion) => (assertion.fullName ?? assertion.title ?? '').includes(criterion.match));
    if (!found) fail(`${criterion.id}: la prueba «${criterion.match}» no se ejecutó`);
    if (found.status !== 'passed') fail(`${criterion.id}: «${found.fullName ?? found.title}» quedó en ${found.status}`);
    console.log(`  [OK] ${criterion.id}  ${criterion.title}`);
  }
  return parsed;
}

console.log('== Aceptación local de la continuidad del historial (QA #31 / #29) ==');
console.log(`Node: ${process.version} (el repositorio declara Node 24 LTS en engines)`);
console.log(`Repositorio: ${root}`);
console.log(`Escenario: apps/web/${spec.split(path.sep).join('/')}`);
console.log('Recorrido real con backend y navegador: tools/qa/hugo-history-acceptance.cjs');
console.log('');

console.log('Comprobaciones estáticas:');
runStaticChecks();
console.log('');
console.log('Escenario de aceptación:');
const parsed = runAcceptance();

const total = parsed.numTotalTests ?? 0;
const failed = parsed.numFailedTests ?? 0;
console.log('');
console.log(`Pruebas ejecutadas: ${total} · aprobadas: ${total - failed} · fallidas: ${failed}`);
console.log('RESULTADO: ACEPTACIÓN APROBADA');
process.exit(0);
