#!/usr/bin/env node
// PL2-14 (#74): compara dos audit.json de ui-responsive-audit.cjs (antes/después) y genera Markdown para el PR.
// Uso: node tools/qa/ui-responsive-compare.cjs <antes.json> <después.json> [--out comparacion.md] [--all] [--fail-on-regression]
const fs = require('node:fs');

// Métricas donde menos es mejor. La altura de página depende de los datos: se muestra, pero no cuenta como regresión.
const METRICS = [
  { key: 'horizontalOverflowPx', label: 'Desbordamiento (px)', lowerIsBetter: true },
  { key: 'smallTargets', label: 'Controles <44 px', lowerIsBetter: true, total: 'interactiveTargets' },
  { key: 'headerHeightPx', label: 'Cabecera (px)', lowerIsBetter: true },
  { key: 'tablesNeedingHorizontalScroll', label: 'Tablas con scroll horizontal', lowerIsBetter: true },
  { key: 'tinyTextElements', label: 'Textos <12 px', lowerIsBetter: true },
  { key: 'pageHeightPx', label: 'Altura de página (px)', informational: true },
];

const keyOf = r => `${r.role}|${r.width}|${r.route}`;

function compareAudits(before, after) {
  const index = new Map(before.results.map(r => [keyOf(r), r]));
  const seen = new Set();
  const rows = [];
  let regressions = 0;
  let improvements = 0;
  for (const next of after.results) {
    const key = keyOf(next);
    const prev = index.get(key);
    seen.add(key);
    if (!prev) { rows.push({ role: next.role, width: next.width, route: next.route, status: 'nueva', metrics: [] }); continue; }
    const metrics = METRICS.map(m => {
      const a = prev[m.key];
      const b = next[m.key];
      const delta = typeof a === 'number' && typeof b === 'number' ? b - a : null;
      const regression = !m.informational && delta !== null && delta > 0;
      const improvement = !m.informational && delta !== null && delta < 0;
      if (regression) regressions++;
      if (improvement) improvements++;
      return { ...m, before: a, after: b, beforeTotal: m.total ? prev[m.total] : undefined, afterTotal: m.total ? next[m.total] : undefined, delta, regression, improvement };
    });
    const h1Regression = prev.h1Count === 1 && next.h1Count !== 1;
    if (h1Regression) regressions++;
    rows.push({ role: next.role, width: next.width, route: next.route, status: 'comparada', metrics, h1Regression,
      changed: metrics.some(m => m.delta) || h1Regression });
  }
  const missing = before.results.filter(r => !seen.has(keyOf(r))).map(r => ({ role: r.role, width: r.width, route: r.route }));
  return { before: { commit: before.commit, checkedAt: before.checkedAt }, after: { commit: after.commit, checkedAt: after.checkedAt }, rows, missing, regressions, improvements };
}

const short = commit => (commit ? String(commit).slice(0, 7) : '?');
function cell(m) {
  const value = (v, total) => (v === null || v === undefined ? '—' : total !== undefined ? `${v}/${total}` : String(v));
  if (m.delta === null) return `${value(m.before, m.beforeTotal)} → ${value(m.after, m.afterTotal)}`;
  if (m.delta === 0) return value(m.after, m.afterTotal);
  const sign = m.delta > 0 ? `+${m.delta}` : `−${Math.abs(m.delta)}`;
  const mark = m.informational ? '' : m.improvement ? ' ✅' : ' ⚠️';
  return `${value(m.before, m.beforeTotal)} → ${value(m.after, m.afterTotal)} (${sign})${mark}`;
}

function toMarkdown(comparison, { all = false } = {}) {
  const lines = [];
  lines.push(`**Auditoría responsiva:** \`${short(comparison.before.commit)}\` → \`${short(comparison.after.commit)}\` — ${comparison.improvements} mejoras, ${comparison.regressions} regresiones.`);
  lines.push('');
  const rows = comparison.rows.filter(r => all || r.status === 'nueva' || r.changed);
  if (!rows.length) lines.push('Sin cambios en las métricas medidas.');
  else {
    lines.push(`| Ancho | Ruta | ${METRICS.map(m => m.label).join(' | ')} |`);
    lines.push(`| --- | --- | ${METRICS.map(() => '---').join(' | ')} |`);
    for (const r of rows) {
      const route = `\`${r.route}\`${r.role === 'admin' ? '' : ` (${r.role})`}${r.h1Regression ? ' ⚠️ h1' : ''}`;
      lines.push(r.status === 'nueva' ? `| ${r.width} | ${route} | ${METRICS.map(() => 'nueva').join(' | ')} |`
        : `| ${r.width} | ${route} | ${r.metrics.map(cell).join(' | ')} |`);
    }
  }
  if (comparison.missing.length) {
    lines.push('');
    lines.push(`Rutas medidas antes y ausentes después: ${comparison.missing.map(m => `${m.width} \`${m.route}\``).join(', ')}.`);
  }
  lines.push('');
  lines.push('✅ menos es mejor · ⚠️ empeora. La altura de página depende de los datos y no cuenta como regresión.');
  return lines.join('\n') + '\n';
}

function main(argv) {
  const args = argv.filter(a => !a.startsWith('--'));
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? argv[outIndex + 1] : null;
  const files = args.filter(a => a !== out);
  if (files.length !== 2) {
    console.error('Uso: node tools/qa/ui-responsive-compare.cjs <antes.json> <después.json> [--out comparacion.md] [--all] [--fail-on-regression]');
    return 2;
  }
  const [before, after] = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
  const comparison = compareAudits(before, after);
  const markdown = toMarkdown(comparison, { all: argv.includes('--all') });
  if (out) fs.writeFileSync(out, markdown);
  process.stdout.write(markdown);
  return argv.includes('--fail-on-regression') && comparison.regressions > 0 ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { compareAudits, toMarkdown, METRICS };
