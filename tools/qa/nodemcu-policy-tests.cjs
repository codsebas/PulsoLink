// Compile and execute the actual pure C++ policy from the single-file sketch.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const sketch = fs.readFileSync(path.join(root, 'firmware/nodemcu/src/pulsolink-v1.3/pulsolink-v1.3.ino'), 'utf8');
const original = fs.readFileSync(path.join(root, 'firmware/nodemcu/src/sketch-pulsa-link-v1.2/sketch-pulsa-link-v1.2.ino'), 'utf8');
const out = path.join(root, '.cache/nodemcu-tests');
fs.mkdirSync(out, { recursive: true });
const policy = sketch.split('// BEGIN NETWORK POLICY')[1].split('\n').slice(1).join('\n').split('// END NETWORK POLICY')[0];
function body(source, name) {
  const start = source.indexOf(name + '(');
  const brace = source.indexOf('{', start);
  let depth = 1, end = brace + 1;
  while (depth && end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
  return source.slice(brace, end).replaceAll('\r\n', '\n');
}
const retained = ['makeBootId', 'startMax', 'serviceTemperature', 'readSample', 'printReport', 'appendMetric', 'resetOpticalWindowAfterPost'];
for (const name of retained) assert.equal(body(sketch, name), body(original, name), name + ' must preserve proven sensor behavior');
assert(sketch.includes('Wire.begin(D2, D1)') && sketch.includes('busTemperatura(D5)'));
assert(sketch.includes('sensor.setup(kLedPower, 4, 2, 100, 411, 4096)'));
assert(!sketch.includes('setInsecure(') && !sketch.includes('#include "config'));
const cpp = `#include <cstdint>
#include <cstring>
#include <iostream>
#include <cstdlib>
#include <ArduinoJson.h>
${policy}
int count = 0;
void check(bool ok) { ++count; if (!ok) { std::cerr << "Failed case " << count; std::exit(1); } }
bool config(const char* input) {
  StaticJsonDocument<2048> doc;
  if (deserializeJson(doc, input)) return false;
  char session[129]; uint32_t upload = 0, heartbeat = 0;
  return decodeConfiguration(doc.as<JsonObjectConst>(), "node-msu-01", session, sizeof(session), upload, heartbeat);
}
int main() {
  check(due(2000, 0, 2000)); check(!due(1999, 0, 2000));
  check(due(10, UINT32_MAX - 9, 20)); check(!due(9, UINT32_MAX - 9, 20));
  for (int code : {400,401,403,404,413}) check(terminalHttp(code));
  for (int code : {-1,200,201,409,429,500,503}) check(!terminalHttp(code));
  check(retrySeconds(nullptr)==30); check(retrySeconds("")==30); check(retrySeconds("0")==1);
  check(retrySeconds("120")==120); check(retrySeconds("bad")==30); check(retrySeconds("-1")==30);
  check(retrySeconds("99999999999999999999")==86400); check(retrySeconds("86400")==86400);
  check(config(R"({"deviceId":"node-msu-01","activeSessionId":null,"uploadIntervalMs":2000,"heartbeatIntervalMs":15000})"));
  check(config(R"({"deviceId":"node-msu-01","activeSessionId":"session-new","uploadIntervalMs":2000,"heartbeatIntervalMs":15000})"));
  check(!config(R"({"deviceId":"another-board","activeSessionId":"s","uploadIntervalMs":2000,"heartbeatIntervalMs":15000})"));
  check(!config(R"({"deviceId":"node-msu-01","uploadIntervalMs":2000,"heartbeatIntervalMs":15000})"));
  check(!config(R"({"deviceId":"node-msu-01","activeSessionId":42,"uploadIntervalMs":2000,"heartbeatIntervalMs":15000})"));
  check(!config(R"({"deviceId":"node-msu-01","activeSessionId":"","uploadIntervalMs":2000,"heartbeatIntervalMs":15000})"));
  check(!config(R"({"deviceId":"node-msu-01","activeSessionId":"a/b","uploadIntervalMs":2000,"heartbeatIntervalMs":15000})"));
  check(!config(R"({"deviceId":"node-msu-01","activeSessionId":"..","uploadIntervalMs":2000,"heartbeatIntervalMs":15000})"));
  check(!config(R"({"deviceId":"node-msu-01","activeSessionId":null,"uploadIntervalMs":0,"heartbeatIntervalMs":15000})"));
  check(!config(R"({"deviceId":"node-msu-01","activeSessionId":null,"uploadIntervalMs":-1,"heartbeatIntervalMs":15000})"));
  check(!config(R"({"deviceId":"node-msu-01","activeSessionId":null,"uploadIntervalMs":"2000","heartbeatIntervalMs":15000})"));
  check(!config(R"({"deviceId":"node-msu-01","activeSessionId":null,"uploadIntervalMs":2000,"heartbeatIntervalMs":86400001})"));
  check(!config("<html>Unavailable</html>")); check(!config("{}"));
  StaticJsonDocument<256> ack;
  deserializeJson(ack, R"({"measurementId":"m","receivedAt":"2026-10-23T00:00:00Z","duplicate":false})");
  check(validMeasurementAck(ack.as<JsonObjectConst>())); ack["duplicate"] = true; check(validMeasurementAck(ack.as<JsonObjectConst>()));
  ack.remove("duplicate"); check(!validMeasurementAck(ack.as<JsonObjectConst>())); ack["duplicate"] = "false"; check(!validMeasurementAck(ack.as<JsonObjectConst>()));
  ack["duplicate"] = false; ack["measurementId"] = ""; check(!validMeasurementAck(ack.as<JsonObjectConst>()));
  std::cout << "{\\"status\\":\\"PASS\\",\\"cppCases\\":" << count << "}";
}
`;
const source = path.join(out, 'policy.cpp');
fs.writeFileSync(source, cpp);
const libraries = process.env.ARDUINO_LIBRARIES || path.join(process.env.USERPROFILE, 'Documents/Arduino/libraries');
const exe = path.join(out, 'policy.exe');
const built = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I' + path.join(libraries, 'ArduinoJson/src'), source, '-o', exe], { encoding: 'utf8', windowsHide: true });
if (built.status !== 0) { console.error(built.stderr); process.exit(1); }
const result = spawnSync(exe, [], { encoding: 'utf8', windowsHide: true });
assert.equal(result.status, 0, result.stderr);
const report = { ...JSON.parse(result.stdout), preservedSensorFunctions: retained, pins: 'D2/D1/D5', generatedAt: new Date().toISOString() };
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
