// Run inside disposable Auth + Firestore emulators, after typecheck/build.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, '.cache/pulsoai-final');
const report = { status: 'FAIL', generatedAt: new Date().toISOString(), stages: [] };
fs.mkdirSync(out, { recursive: true });
function run(name, args, cwd, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd, env, windowsHide: true,
    timeout: 900_000, stdio: 'inherit' });
  report.stages.push({ name, exitCode: result.status });
  assert.equal(result.status, 0, name + ' failed');
}
function vitest(name, folder, skipped) {
  const output = path.join(out, name + '-tests.json');
  run(name, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--fileParallelism=false',
    '--reporter=json', '--outputFile=' + output], path.join(root, folder));
  const results = JSON.parse(fs.readFileSync(output));
  assert(results.success && results.numFailedTests === 0);
  assert.equal(results.numPendingTests, skipped, name + ' unexpected omissions');
  report.stages.at(-1).passed = results.numPassedTests;
  report.stages.at(-1).skipped = results.numPendingTests;
}
try {
  assert.equal(process.versions.node.split('.')[0], '24');
  assert(process.env.FIREBASE_PROJECT_ID?.startsWith('demo-'));
  assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ''));
  assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || ''));
  assert.equal(process.env.PULSOAI_QA_ALLOW_REAL_GROQ, 'true');
  // Auth emulator password login always uses its CLI default project. Run the
  // browser first in that clean project, before API tests create pending jobs.
  run('browser-Groq-and-web-HTTP', [path.join(root, 'tools/qa/pulsoai-acceptance.cjs')], root);
  const http = JSON.parse(fs.readFileSync(path.join(root, '.cache/pulsoai-browser/web-http-tests.json')));
  assert(http.success && http.numPassedTests === 2 && http.numPendingTests === 0);
  vitest('api', 'apps/api', 0);
  vitest('web', 'apps/web', 2); // Closed by the authenticated HTTP runner below.
  const simulator = path.join(root, 'tools/device-simulator');
  const files = fs.readdirSync(path.join(simulator, 'test')).filter(f => f.endsWith('.test.ts'))
    .map(f => path.join(simulator, 'test', f));
  run('simulator', [path.join(root, 'node_modules/tsx/dist/cli.mjs'), '--test', ...files], simulator);
  run('worker-process-restart', [path.join(root, 'tools/qa/pulsoai-restart-acceptance.cjs')], root);
  report.status = 'PASS';
} catch (error) {
  report.failure = error?.name === 'AssertionError' ? error.message : 'Suite runner failed';
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
