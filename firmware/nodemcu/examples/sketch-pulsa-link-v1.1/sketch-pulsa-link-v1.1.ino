#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

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

uint32_t infrared[kSamples];
uint32_t red[kSamples];
int32_t oxygen = 0;
int32_t pulse = 0;
int8_t oxygenValid = 0;
int8_t pulseValid = 0;
bool windowReady = false;
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

bool startMax() {
  lastMaxAttempt = millis();
  // Misma inicializacion y configuracion que el lector independiente probado.
  if (!sensor.begin(Wire, I2C_SPEED_STANDARD)) return false;
  sensor.setup(kLedPower, 4, 2, 100, 411, 4096);
  windowReady = false;
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
    // Mantiene la lectura optica del programa que ya funciono.
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
  Serial.println(F("PulsoLink: prueba experimental, no uso clinico."));
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
    delay(1);
    return;
  }

  // Las ventanas de muestras siguen la misma secuencia del programa probado.
  if (!windowReady) {
    for (int i = 0; i < kSamples; ++i) {
      if (!readSample(i)) {
        Serial.println(F("No llegan muestras del MAX30102; reintentando"));
        maxFound = false;
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
  printReport(saturated, fingerAbsent);
}
