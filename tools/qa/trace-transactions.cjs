// Disposable emulator diagnostics only. No document IDs, payloads or secrets.
if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:') || !process.env.FIREBASE_PROJECT_ID?.startsWith('demo-') || !process.env.QA_TRANSACTION_REPORT) throw new Error('Local demo emulator and report path required');
const { Firestore } = require('@google-cloud/firestore');
const { appendFileSync } = require('node:fs');
const run = Firestore.prototype.runTransaction;
const safeCode = error => typeof error?.code === 'number' ? error.code : 'application-error';
Firestore.prototype.runTransaction = async function (fn, options) {
  const started = performance.now();
  const row = { startedAt: new Date().toISOString(), attempts: [] };
  try {
    const value = await run.call(this, async transaction => {
      const attempt = { reads: [] }; row.attempts.push(attempt);
      // Proxy binds SDK methods to the real transaction and traces only reads.
      const proxy = new Proxy(transaction, { get(target, key) {
        const value = Reflect.get(target, key);
        if (key === 'get' || key === 'getAll') return async (...args) => {
          const start = performance.now();
          const read = { collections: args.filter(a=>a?.parent?.id).map(a=>a.parent.id) };
          attempt.reads.push(read);
          try { return await value.apply(target, args); }
          catch (error) { read.errorCode = safeCode(error); throw error; }
          finally { read.durationMs = Math.round(performance.now()-start); }
        };
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      try { return await fn(proxy); } catch(error) { attempt.errorCode=safeCode(error); throw error; }
    }, options);
    row.outcome = 'committed'; return value;
  } catch(error) { row.outcome = 'rejected'; row.errorCode = safeCode(error); throw error; }
  finally { row.durationMs=Math.round(performance.now()-started); appendFileSync(process.env.QA_TRANSACTION_REPORT,JSON.stringify(row)+'\n'); }
};
