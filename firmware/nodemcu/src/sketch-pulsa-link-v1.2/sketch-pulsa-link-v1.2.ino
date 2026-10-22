#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

// PulsoLink v1.2: prueba temporal de lecturas reales por Wi-Fi.
// Copia config.example.h a config.local.h y configura tu red local.
// config.local.h queda excluido de Git; no compartas sus credenciales.
#include "config.local.h"

// IDs de prueba. Esta ruta de desarrollo no autentica ni guarda lecturas.
const char *kDeviceId = "pulsolink-prueba";
const char *kSessionId = "sesion-prueba";

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
const unsigned long kPostPeriodMs = 2000;
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
  body += kDeviceId;
  body += F("\",\"sessionId\":\"");
  body += kSessionId;
  body += F("\",\"bootId\":\"");
  body += bootId;
  body += F("\",\"sequence\":");
  body += String((unsigned long)sequenceNumber);
  // No hay reloj UTC sincronizado en esta prueba; el servidor da receivedAt.
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

void maybePostReading() {
  unsigned long now = millis();
  if (now - lastPostAt < kPostPeriodMs) return;
  lastPostAt = now;  // Un intervalo desconectado se pierde: no hay cola.

  if (WiFi.status() != WL_CONNECTED) {
    if (wifiWasConnected) Serial.println(F("Wi-Fi desconectado; lectura descartada"));
    wifiWasConnected = false;
    return;
  }
  if (!wifiWasConnected) {
    wifiWasConnected = true;
    Serial.print(F("Wi-Fi conectado. IP: "));
    Serial.println(WiFi.localIP());
  }

  if (sequenceNumber == UINT32_MAX) {
    Serial.println(F("Secuencia agotada; reinicia la placa"));
    return;
  }
  ++sequenceNumber;
  String payload = buildPayload();
  if (payload.length() == 0) {
    Serial.println(F("No hay memoria para crear el JSON"));
    return;
  }

  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, kApiUrl)) {
    Serial.println(F("No se pudo iniciar el POST"));
    return;
  }
  http.setTimeout(1500);
  http.addHeader(F("Content-Type"), F("application/json"));
  int code = http.POST(payload);
  Serial.print(F("POST reading-test HTTP="));
  Serial.println(code);
  if (code > 0) Serial.println(http.getString());
  else Serial.println(http.errorToString(code));
  http.end();
  resetOpticalWindowAfterPost();
  lastPostAt = millis();  // Al menos 2 s entre el fin de dos intentos.
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
  WiFi.begin(kWifiSsid, kWifiPassword);
  makeBootId();
  lastPostAt = millis();
  Serial.println(F("PulsoLink v1.2: prueba experimental, no uso clinico."));
  Serial.print(F("bootId="));
  Serial.println(bootId);
}

void loop() {
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
    maybePostReading();
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
  maybePostReading();
}
