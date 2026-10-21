// Optional diagnostic preload. Never records headers, bodies, query values or errors.
const fs = require('node:fs');
const original = globalThis.fetch;
const calls = [];
globalThis.fetch = async (input, init) => {
  const start = performance.now();
  const pathname = new URL(typeof input === 'string' ? input : input.url || input.toString()).pathname;
  const row = { startedAt: new Date().toISOString(), method: init?.method || 'GET', path: pathname.replace(/\/(sessions|patients|assignments|devices)\/[^/]+/g, '/$1/:id') };
  calls.push(row);
  try { const response = await original(input, init); row.status = response.status; return response; }
  catch (error) { row.outcome = error?.name === 'TimeoutError' ? 'timeout' : 'transport-error'; throw error; }
  finally { row.durationMs = Math.round(performance.now() - start); }
};
process.once('exit', () => {
  if (process.env.QA_TIMING_REPORT) fs.writeFileSync(process.env.QA_TIMING_REPORT, JSON.stringify({ node: process.version, calls }, null, 2) + '\n');
});
