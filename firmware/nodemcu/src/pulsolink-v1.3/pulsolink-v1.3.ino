#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <ArduinoJson.h>
#include <time.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

// Node MSU 01 - PulsoLink v1.3, API oficial Render.
// Un solo archivo: completar SOLO la copia privada, nunca publicar secretos.
const char *kWifiSsid = "TU_RED_WIFI";
const char *kWifiPassword = "TU_CLAVE_WIFI";
const char *kDeviceId = "node-msu-01";
const char *kDeviceCredential = "CREDENTIAL_ID.SECRET";
const char *kApiBase = "https://pulsolink-api.onrender.com/api/v1";
const char *kFirmwareVersion = "pulsolink-1.3.1";
// GTS Root R4, descargada de https://pki.goog/roots.pem el 23-10-2026.
// CA raiz (no certificado efimero de Render); verificar si cambia el emisor.
static const char kRootCa[] PROGMEM = R"PEM(-----BEGIN CERTIFICATE-----
MIICCTCCAY6gAwIBAgINAgPlwGjvYxqccpBQUjAKBggqhkjOPQQDAzBHMQswCQYD
VQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIG
A1UEAxMLR1RTIFJvb3QgUjQwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAwMDAw
WjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2Vz
IExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjQwdjAQBgcqhkjOPQIBBgUrgQQAIgNi
AATzdHOnaItgrkO4NcWBMHtLSZ37wWHO5t5GvWvVYRg1rkDdc/eJkTBa6zzuhXyi
QHY7qca4R9gq55KRanPpsXI5nymfopjTX15YhmUPoYRlBtHci8nHc8iMai/lxKvR
HYqjQjBAMA4GA1UdDwEB/wQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQW
BBSATNbrdP9JNqPV2Py1PsVq8JQdjDAKBggqhkjOPQQDAwNpADBmAjEA6ED/g94D
9J+uHXqnLrmvT/aDHQ4thQEd0dlq7A/Cr8deVl5c1RxYIigL9zC2L7F8AjEA8GE8
p/SgguMh1YQdc4acLa/KNJvxn7kjNuK8YAOdgLOaVsjh4rsUecrNIdSUtUlD
-----END CERTIFICATE-----
)PEM";

// NodeMCU ESP8266: MAX30102 SDA=D2, SCL=D1; DS18B20 datos=D5.
// El DS18B20 necesita una resistencia de 4.7k entre D5 y 3V.
MAX30105 sensor;
OneWire busTemperatura(D5);
DallasTemperature sensorTemperatura(&busTemperatura);

const int kSamples = 100;
const byte kLedPower = 10;
const unsigned long kTempPeriodMs = 3000;
const unsigned long kTempConversionMs = 750;
const unsigned long kRetryMs = 5000;
const unsigned long kConfigPeriodMs = 10000;
const unsigned long kMaxTempAgeMs = 7000;
const unsigned long kMaxOpticalAgeMs = 2500;

uint32_t infrared[kSamples];
uint32_t red[kSamples];
int32_t oxygen = 0;
int32_t pulse = 0;
int8_t oxygenValid = 0;
int8_t pulseValid = 0;
bool windowReady = false;
bool opticalReady = false;
bool lastSaturated = false;
bool lastFingerAbsent = false;
unsigned long lastOpticalAt = 0;

bool maxFound = false;
unsigned long lastMaxAttempt = 0;
unsigned long lastMissingReport = 0;
bool tempFound = false;
bool tempPending = false;
bool tempValid = false;
float tempC = 0;
unsigned long tempStarted = 0;
unsigned long tempUpdated = 0;
unsigned long nextTemp = 0;
unsigned long lastTempAttempt = 0;

char bootId[37];  // UUID v4 generado de nuevo en cada arranque.
uint32_t sequenceNumber = 0;
unsigned long lastPostAt = 0;
bool wifiWasConnected = false;
volatile bool linkLost = false;
WiFiEventHandler disconnectHandler;
bool configured = false, halted = false, heartbeatSent = false, requestMade = false;
String activeSessionId;
uint32_t lastConfigAt = 0, lastHeartbeatAt = 0, retryStarted = 0, retryWaitMs = 0;
uint32_t uploadIntervalMs = 2000, heartbeatIntervalMs = 15000;
uint8_t networkFailures = 0;
BearSSL::X509List trustAnchor(kRootCa);
BearSSL::WiFiClientSecure secureClient;
BearSSL::Session tlsSession;
HTTPClient http;
StaticJsonDocument<2048> responseDoc;

void makeBootId() {
  uint8_t bytes[16];
  ESP.random(bytes, sizeof(bytes));
  bytes[6] = (bytes[6] & 0x0F) | 0x40;  // Versión 4.
  bytes[8] = (bytes[8] & 0x3F) | 0x80;  // Variante RFC 4122.
  const char hex[] = "0123456789abcdef";
  int pos = 0;
  for (int i = 0; i < 16; ++i) {
    if (i == 4 || i == 6 || i == 8 || i == 10) bootId[pos++] = '-';
    bootId[pos++] = hex[bytes[i] >> 4];
    bootId[pos++] = hex[bytes[i] & 0x0F];
  }
  bootId[pos] = '\0';
}

bool startMax() {
  lastMaxAttempt = millis();
  // Misma inicialización y configuración de PulsoLink v1.1.
  if (!sensor.begin(Wire, I2C_SPEED_STANDARD)) return false;
  sensor.setup(kLedPower, 4, 2, 100, 411, 4096);
  windowReady = false;
  opticalReady = false;
  return true;
}

void serviceTemperature() {
  unsigned long now = millis();
  if (!tempFound) {
    if (now - lastTempAttempt < kRetryMs) return;
    lastTempAttempt = now;
    sensorTemperatura.begin();
    tempFound = sensorTemperatura.getDeviceCount() > 0;
    tempValid = false;
    if (tempFound) {
      sensorTemperatura.setWaitForConversion(false);
      nextTemp = now;
      Serial.println(F("DS18B20: detectado"));
    }
    return;
  }

  if (tempPending && now - tempStarted >= kTempConversionMs) {
    float value = sensorTemperatura.getTempCByIndex(0);
    tempPending = false;
    if (value >= -55.0f && value <= 125.0f) {
      tempC = value;
      tempUpdated = now;
      tempValid = true;
    } else {
      tempValid = false;
      tempFound = false;
      lastTempAttempt = now;
      Serial.println(F("DS18B20: lectura fallida; reintentando"));
    }
  }

  if (tempFound && !tempPending && (int32_t)(now - nextTemp) >= 0) {
    sensorTemperatura.requestTemperatures();
    tempStarted = now;
    nextTemp = now + kTempPeriodMs;
    tempPending = true;
  }
}

bool readSample(int index) {
  unsigned long started = millis();
  while (!sensor.available()) {
    sensor.check();
    serviceTemperature();
    if (millis() - started > 2000) return false;
    yield();
  }
  red[index] = sensor.getFIFORed();
  infrared[index] = sensor.getFIFOIR();
  sensor.nextSample();
  serviceTemperature();
  return true;
}

void printReport(bool saturated, bool fingerAbsent) {
  Serial.print(F("TEMP="));
  if (tempValid) {
    Serial.print(tempC, 2);
    Serial.print(F("C edad="));
    Serial.print((millis() - tempUpdated) / 1000);
    Serial.print(F("s"));
  } else {
    Serial.print(F("sin dato"));
  }
  Serial.print(F("  IR="));
  Serial.print(infrared[kSamples - 1]);
  Serial.print(F("  ROJO="));
  Serial.print(red[kSamples - 1]);
  if (saturated) Serial.print(F("  SENAL SATURADA"));
  else if (fingerAbsent) Serial.print(F("  DEDO AUSENTE/SENAL DEBIL"));
  Serial.print(F("  BPM="));
  if (pulseValid) Serial.print(pulse);
  else Serial.print(F("sin dato"));
  Serial.print(F("  SpO2="));
  if (oxygenValid) {
    Serial.print(oxygen);
    Serial.print(F("%"));
  } else {
    Serial.print(F("sin dato"));
  }
  Serial.println();
}

// Los nombres, unidades y estados corresponden a MeasurementInput de OpenAPI.
// Si el estado no es valid, el valor se envía como JSON null.
void appendMetric(String &body, const char *name, float value,
                  uint8_t decimals, const char *unit, const char *status) {
  body += '"';
  body += name;
  body += F("\":{\"value\":");
  if (strcmp(status, "valid") == 0) body += String(value, decimals);
  else body += F("null");
  body += F(",\"unit\":\"");
  body += unit;
  body += F("\",\"status\":\"");
  body += status;
  body += F("\"}");
}

String escapeJsonString(const String &value) {
  String escaped;
  for (size_t i = 0; i < value.length(); ++i) {
    const unsigned char c = value[i];
    if (c == '"' || c == '\\') { escaped += '\\'; escaped += char(c); }
    else if (c < 32) { char code[7]; snprintf(code, sizeof(code), "\\u%04x", c); escaped += code; }
    else escaped += char(c);
  }
  return escaped;
}

String buildPayload() {
  const unsigned long now = millis();
  const bool opticalFresh = maxFound && opticalReady &&
                            now - lastOpticalAt <= kMaxOpticalAgeMs;
  const bool temperatureFresh = tempFound && tempValid &&
                                now - tempUpdated <= kMaxTempAgeMs;

  const char *heartStatus = "unavailable";
  const char *spo2Status = "unavailable";
  if (opticalFresh) {
    if (lastSaturated) {
      heartStatus = "invalid";
      spo2Status = "invalid";
    } else if (lastFingerAbsent) {
      heartStatus = "no_contact";
      spo2Status = "no_contact";
    } else {
      heartStatus = pulseValid && pulse > 0 && pulse <= 300
                        ? "valid" : "invalid";
      spo2Status = oxygenValid && oxygen >= 0 && oxygen <= 100
                       ? "valid" : "invalid";
    }
  }
  const char *tempStatus = temperatureFresh ? "valid" : "unavailable";

  String body;
  if (!body.reserve(400)) return String();
  body += F("{\"deviceId\":\"");
  body += escapeJsonString(kDeviceId);
  body += F("\",\"sessionId\":\"");
  body += escapeJsonString(activeSessionId);
  body += F("\",\"bootId\":\"");
  body += bootId;
  body += F("\",\"sequence\":");
  body += String((unsigned long)sequenceNumber);
  // La ventana agrupa varias muestras; el servidor asigna receivedAt.
  body += F(",\"capturedAt\":null,\"measurements\":{");
  appendMetric(body, "heartRate", pulse, 0, "bpm", heartStatus);
  body += ',';
  appendMetric(body, "spo2", oxygen, 0, "%", spo2Status);
  body += ',';
  appendMetric(body, "skinTemperature", tempC, 2, "C", tempStatus);
  body += F("}}");
  return body;
}

// La petición HTTP puede interrumpir la secuencia de 100 Hz. Se descartan
// muestras ópticas pendientes y se inicia una ventana nueva después del POST.
void resetOpticalWindowAfterPost() {
  windowReady = false;
  opticalReady = false;
  pulseValid = 0;
  oxygenValid = 0;
  if (!maxFound) return;
  while (sensor.available()) sensor.nextSample();
  sensor.clearFIFO();
}

// BEGIN NETWORK POLICY (also compiled by the native regression tests).
bool due(uint32_t now, uint32_t since, uint32_t interval) {
  return uint32_t(now - since) >= interval;
}
bool terminalHttp(int code) {
  return code == 400 || code == 401 || code == 403 || code == 404 || code == 413;
}
uint32_t retrySeconds(const char *value) {
  if (!value || !*value) return 30;
  uint32_t seconds = 0;
  for (const char *p = value; *p; ++p) {
    if (*p < '0' || *p > '9') return 30;
    seconds = seconds * 10 + uint32_t(*p - '0');
    if (seconds >= 86400) return 86400;
  }
  return seconds < 1 ? 1 : seconds;
}
bool decodeConfiguration(JsonObjectConst data, const char *expected, char *session,
                         size_t capacity, uint32_t &upload, uint32_t &heartbeat) {
  if (strcmp(data["deviceId"] | "", expected) || !data.containsKey("activeSessionId") ||
      (!data["activeSessionId"].isNull() && !data["activeSessionId"].is<const char *>()) ||
      !data["uploadIntervalMs"].is<uint32_t>() || !data["heartbeatIntervalMs"].is<uint32_t>()) return false;
  const char *id = data["activeSessionId"] | "";
  const size_t length = strlen(id);
  if (length >= capacity || length > 128 || strchr(id, '/') || !strcmp(id, ".") || !strcmp(id, "..") ||
      (!data["activeSessionId"].isNull() && !length)) return false;
  upload = data["uploadIntervalMs"]; heartbeat = data["heartbeatIntervalMs"];
  if (!upload || upload > 86400000UL || !heartbeat || heartbeat > 86400000UL) return false;
  memcpy(session, id, length + 1);
  return true;
}
bool validMeasurementAck(JsonObjectConst data) {
  return data["measurementId"].is<const char *>() && strlen(data["measurementId"].as<const char *>()) &&
    data["receivedAt"].is<const char *>() && strlen(data["receivedAt"].as<const char *>()) && data["duplicate"].is<bool>();
}
// END NETWORK POLICY

void discardContext() {
  resetOpticalWindowAfterPost();
  tempValid = false;
  tempPending = false;
  nextTemp = millis();
}

void forgetSession() {
  configured = false;
  heartbeatSent = false;
  activeSessionId = "";
  discardContext();
}

void deferNetwork(uint32_t delayMs) {
  retryStarted = millis();
  retryWaitMs = delayMs;
  forgetSession();
  secureClient.stop();
}

// Bounded, decoded HTTP body; never print provider bodies or Authorization.
class ResponseBuffer : public Stream {
public:
  char bytes[2049];
  size_t length = 0;
  bool overflow = false;
  ResponseBuffer() { bytes[0] = 0; }
  size_t write(uint8_t value) override {
    if (length >= sizeof(bytes) - 1) { overflow = true; return 0; }
    bytes[length++] = char(value); bytes[length] = 0; return 1;
  }
  using Print::write;
  // ESP8266 HTTPClient uses sendSize, which checks capacity before write().
  int availableForWrite() override { return int(sizeof(bytes) - 1 - length); }
  bool outputCanTimeout() override { return false; }
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}
};

int requestApi(const char *route, const String *payload) {
  requestMade = true;
  responseDoc.clear();
  if (!http.begin(secureClient, String(kApiBase) + route)) {
    deferNetwork(5000); return -1;
  }
  http.setReuse(true);
  http.setTimeout(8000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  const char *headers[] = { "Retry-After" };
  http.collectHeaders(headers, 1);
  http.addHeader(F("Authorization"), String(F("Bearer ")) + kDeviceCredential);
  http.addHeader(F("Content-Type"), F("application/json"));
  const uint32_t started = millis();
  const int code = payload ? http.POST(*payload) : http.GET();
  const String retryAfter = http.header("Retry-After");
  static ResponseBuffer body;
  body.length = 0; body.bytes[0] = 0; body.overflow = false;
  bool readable = false;
  if (code > 0 && http.getSize() <= 2048) {
    const int read = http.writeToStream(&body);
    readable = read >= 0 && !body.overflow && !deserializeJson(responseDoc, static_cast<const char *>(body.bytes));
  }
  http.end();
  Serial.print(F("API ")); Serial.print(route);
  Serial.print(F(" HTTP=")); Serial.print(code);
  Serial.print(F(" ms=")); Serial.println(millis() - started);
  if (code >= 200 && code < 300 && readable) { networkFailures = 0; return code; }
  if (terminalHttp(code)) {
    halted = true; forgetSession(); secureClient.stop();
    Serial.println(F("API: revisar identidad/credencial/configuracion; reiniciar tras corregir."));
  } else if (code == 409) {
    const char *error = responseDoc["error"]["code"] | "";
    if (!strcmp(error, "IDEMPOTENCY_CONFLICT")) {
      halted = true; forgetSession();
      Serial.println(F("API: conflicto de secuencia; envio detenido."));
    } else {
      deferNetwork(1000);
      Serial.println(F("Sesion/asignacion cambio; muestra descartada, se consultara config."));
    }
  } else if (code == 429) {
    deferNetwork(retrySeconds(retryAfter.c_str()) * 1000UL);
    Serial.println(F("API: pausa Retry-After; muestras descartadas."));
  } else {
    if (networkFailures < 4) ++networkFailures;
    deferNetwork(5000UL << (networkFailures - 1));
    Serial.println(F("API no disponible o respuesta invalida; sin cola ni reenvio."));
  }
  return -1;
}

bool fetchConfiguration() {
  if (requestApi("/device/config", nullptr) != 200) return false;
  JsonObjectConst data = responseDoc["data"].as<JsonObjectConst>();
  char session[129];
  uint32_t upload = 0, heartbeat = 0;
  if (!decodeConfiguration(data, kDeviceId, session, sizeof(session), upload, heartbeat)) {
    halted = true; forgetSession();
    Serial.println(F("Config invalida o de otra placa; envio detenido.")); return false;
  }
  if (activeSessionId != session) {
    discardContext();
    activeSessionId = session;
    Serial.println(activeSessionId.length() ? F("Sesion activa recibida; esperando muestras nuevas.") : F("Sin sesion activa; solo presencia."));
  }
  configured = true;
  uploadIntervalMs = upload;
  heartbeatIntervalMs = heartbeat;
  lastConfigAt = millis();
  return true;
}

void sendHeartbeat() {
  StaticJsonDocument<384> doc;
  doc["deviceId"] = kDeviceId;
  doc["bootId"] = bootId;
  doc["uptimeMs"] = millis();
  doc["firmwareVersion"] = kFirmwareVersion;
  String body; serializeJson(doc, body);
  if (requestApi("/device/heartbeat", &body) == 200) lastHeartbeatAt = millis();
}

void serviceNetwork() {
  if (linkLost) {
    linkLost = false; wifiWasConnected = false; forgetSession(); secureClient.stop();
    Serial.println(F("Corte Wi-Fi observado; ventana anterior descartada."));
  }
  const bool online = WiFi.status() == WL_CONNECTED;
  if (!online) {
    if (wifiWasConnected) {
      Serial.println(F("Wi-Fi perdido; muestras descartadas, sin cola."));
      wifiWasConnected = false; forgetSession(); secureClient.stop();
    }
    return;
  }
  if (!wifiWasConnected) {
    wifiWasConnected = true; forgetSession(); retryWaitMs = 0;
    Serial.println(F("Wi-Fi conectado; sincronizando hora y consultando API."));
  }
  if (halted || time(nullptr) < 1767225600) return; // Valid UTC needed for TLS.
  const uint32_t now = millis();
  if (retryWaitMs && !due(now, retryStarted, retryWaitMs)) return;
  retryWaitMs = 0;
  requestMade = false;
  if (!configured || due(now, lastConfigAt, kConfigPeriodMs)) fetchConfiguration();
  if (configured && !halted && !retryWaitMs &&
      (!heartbeatSent || due(millis(), lastHeartbeatAt, heartbeatIntervalMs))) {
    sendHeartbeat(); heartbeatSent = configured;
  }
  if (configured && !halted && !retryWaitMs && !linkLost && WiFi.status() == WL_CONNECTED && activeSessionId.length() &&
      due(millis(), lastPostAt, uploadIntervalMs) && (opticalReady || !maxFound)) {
    lastPostAt = millis();
    if (sequenceNumber == UINT32_MAX) {
      halted = true; Serial.println(F("Secuencia agotada; reiniciar placa."));
    } else {
      ++sequenceNumber;
      String payload = buildPayload();
      if (payload.length()) {
        const int result = requestApi("/device/measurements", &payload);
        if (result == 201 || result == 200) {
          if (validMeasurementAck(responseDoc["data"])) Serial.println(F("Medicion aceptada por API."));
          else { deferNetwork(5000); Serial.println(F("Confirmacion invalida; muestra no reenviada.")); }
        }
      }
      lastPostAt = millis();
    }
  }
  // Preserve the original policy: HTTP interrupts optical acquisition. Rebuild
  // a contiguous window; never present a discontinuous buffer as valid signal.
  if (requestMade) resetOpticalWindowAfterPost();
}


void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(D2, D1);
  maxFound = startMax();
  Serial.println(maxFound ? F("MAX30102: detectado") : F("MAX30102: no responde"));

  lastTempAttempt = millis();
  sensorTemperatura.begin();
  tempFound = sensorTemperatura.getDeviceCount() > 0;
  sensorTemperatura.setWaitForConversion(false);
  nextTemp = millis();
  Serial.println(tempFound ? F("DS18B20: detectado") : F("DS18B20: no detectado"));

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  disconnectHandler = WiFi.onStationModeDisconnected([](const WiFiEventStationModeDisconnected &) { linkLost = true; });
  secureClient.setTrustAnchors(&trustAnchor);
  secureClient.setSession(&tlsSession);
  secureClient.setTimeout(8000);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  WiFi.begin(kWifiSsid, kWifiPassword);
  makeBootId();
  lastPostAt = millis();
  Serial.println(F("Node MSU 01 - PulsoLink v1.3.1: prototipo academico, no uso clinico."));
  Serial.print(F("bootId="));
  Serial.println(bootId);
}

void loop() {
  serviceNetwork();
  serviceTemperature();
  if (!maxFound) {
    if (millis() - lastMaxAttempt >= kRetryMs) {
      maxFound = startMax();
      Serial.println(maxFound ? F("MAX30102: detectado") : F("MAX30102: no responde"));
    }
    if (millis() - lastMissingReport >= 1000) {
      lastMissingReport = millis();
      Serial.print(F("TEMP="));
      if (tempValid) Serial.print(tempC, 2);
      else Serial.print(F("sin dato"));
      Serial.println(F("  MAX30102=ausente"));
    }
    serviceNetwork();
    delay(1);
    return;
  }

  // Las ventanas de muestras siguen la secuencia probada en PulsoLink v1.1.
  if (!windowReady) {
    for (int i = 0; i < kSamples; ++i) {
      if (!readSample(i)) {
        Serial.println(F("No llegan muestras del MAX30102; reintentando"));
        maxFound = false;
        opticalReady = false;
        lastMaxAttempt = millis();
        return;
      }
    }
    windowReady = true;
  } else {
    for (int i = 25; i < kSamples; ++i) {
      infrared[i - 25] = infrared[i];
      red[i - 25] = red[i];
    }
    for (int i = 75; i < kSamples; ++i) {
      if (!readSample(i)) {
        windowReady = false;
        maxFound = false;
        opticalReady = false;
        lastMaxAttempt = millis();
        Serial.println(F("Se interrumpieron las muestras; reintentando"));
        return;
      }
    }
  }

  bool saturated = false;
  bool fingerAbsent = false;
  for (int i = 0; i < kSamples; ++i) {
    if (infrared[i] >= 260000 || red[i] >= 260000) saturated = true;
    if (infrared[i] < 2000 || red[i] < 2000) fingerAbsent = true;
  }
  if (!saturated && !fingerAbsent) {
    maxim_heart_rate_and_oxygen_saturation(
        infrared, kSamples, red, &oxygen, &oxygenValid, &pulse, &pulseValid);
  } else {
    oxygenValid = 0;
    pulseValid = 0;
  }
  lastSaturated = saturated;
  lastFingerAbsent = fingerAbsent;
  lastOpticalAt = millis();
  opticalReady = true;
  printReport(saturated, fingerAbsent);
  serviceNetwork();
}
