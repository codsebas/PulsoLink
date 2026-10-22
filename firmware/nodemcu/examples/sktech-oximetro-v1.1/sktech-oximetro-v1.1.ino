#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

MAX30105 sensor;

const int kSamples = 100;
const byte kLedPower = 10;  // Menos luz para evitar saturar el ADC.
uint32_t infrared[kSamples];
uint32_t red[kSamples];
int32_t oxygen = 0;
int32_t pulse = 0;
int8_t oxygenValid = 0;
int8_t pulseValid = 0;
bool windowReady = false;

bool readSample(int index) {
  unsigned long started = millis();
  while (!sensor.available()) {
    sensor.check();
    if (millis() - started > 2000) return false;
    yield();
  }
  red[index] = sensor.getFIFORed();
  infrared[index] = sensor.getFIFOIR();
  sensor.nextSample();
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(D2, D1);

  if (!sensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("MAX30102 no responde");
    while (true) delay(100);
  }

  sensor.setup(kLedPower, 4, 2, 100, 411, 4096);
  Serial.println("Apoya el dedo suavemente y mantenlo quieto.");
}

void loop() {
  if (!windowReady) {
    for (int i = 0; i < kSamples; ++i) {
      if (!readSample(i)) {
        Serial.println("No llegan muestras del sensor");
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
        Serial.println("Se interrumpieron las muestras");
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

  Serial.print("IR=");
  Serial.print(infrared[kSamples - 1]);
  Serial.print("  ROJO=");
  Serial.print(red[kSamples - 1]);
  if (saturated) Serial.print("  SENAL SATURADA");
  else if (fingerAbsent) Serial.print("  DEDO AUSENTE/SENAL DEBIL");
  Serial.print("  BPM=");
  if (pulseValid) Serial.print(pulse);
  else Serial.print("sin dato");
  Serial.print("  SpO2=");
  if (oxygenValid) {
    Serial.print(oxygen);
    Serial.print("%");
  } else {
    Serial.print("sin dato");
  }
  Serial.println();
}