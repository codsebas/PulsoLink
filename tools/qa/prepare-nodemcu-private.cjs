// Produce the user's single private .ino; actual secrets never enter the repo.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const project = 'pulsolink-pruebas-2026-7c8a31';
const privateRoot = path.join(process.env.LOCALAPPDATA, 'PulsoLink', project);
const target = path.join(privateRoot, 'Node-MSU-01', 'pulsolink-v1.3');
function outside(folder, file) {
  const relative = path.relative(path.resolve(folder), file);
  return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}
try {
  const sourceFile = process.argv[2];
  assert(sourceFile && path.isAbsolute(sourceFile), 'Provide the private original sketch path.');
  for (const forbidden of [root, process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter(Boolean)) assert(outside(forbidden, target));
  const credentials = JSON.parse(fs.readFileSync(path.join(privateRoot, 'physical-node-msu-01.json')));
  assert.equal(credentials.projectId, project);
  assert.equal(credentials.deviceId, 'node-msu-01');
  assert.equal(credentials.code, 'Node MSU 01');
  assert(/^[A-Za-z0-9_-]{43,128}$/.test(credentials.secret));
  const original = fs.readFileSync(sourceFile, 'utf8');
  function value(name) {
    const match = original.match(new RegExp('const char \\*' + name + '\\s*=\\s*("(?:\\\\.|[^"\\\\])*");'));
    assert(match, 'Missing private Wi-Fi setting'); return JSON.parse(match[1]);
  }
  const ssid = value('kWifiSsid'), password = value('kWifiPassword');
  let sketch = fs.readFileSync(path.join(root, 'firmware/nodemcu/src/pulsolink-v1.3/pulsolink-v1.3.ino'), 'utf8');
  for (const [name, val] of Object.entries({ kWifiSsid: ssid, kWifiPassword: password,
    kDeviceCredential: credentials.credentialId + '.' + credentials.secret })) {
    const pattern = new RegExp('const char \\*' + name + ' = "[^"\\r\\n]*";');
    assert(pattern.test(sketch));
    sketch = sketch.replace(pattern, () => 'const char *' + name + ' = ' + JSON.stringify(val) + ';');
  }
  fs.mkdirSync(target, { recursive: true });
  if (process.platform === 'win32') execFileSync('icacls', [path.dirname(target), '/inheritance:r', '/grant:r',
    os.userInfo().username + ':(OI)(CI)F', 'SYSTEM:(OI)(CI)F'], { stdio: 'ignore', windowsHide: true });
  // Explicit reruns replace only this generated file, retaining a recovery copy.
  const output = path.join(target, 'pulsolink-v1.3.ino');
  if (fs.existsSync(output)) fs.copyFileSync(output, output + '.previous');
  fs.writeFileSync(output, sketch, { mode: 0o600 });
  const backup = path.join(privateRoot, 'Node-MSU-01', 'original-v1.2', 'original-v1.2.ino');
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: 'PREPARED', privateSketch: output, originalBackup: backup, secretsPrinted: false }));
} catch {
  console.error('Private sketch preparation failed. Check private inputs/permissions; no secrets displayed.');
  process.exitCode = 1;
}
