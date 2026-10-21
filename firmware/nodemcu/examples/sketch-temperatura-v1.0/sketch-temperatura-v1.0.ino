#include <OneWire.h>
#include <DallasTemperature.h>

// DS18B20: DQ en D5 (GPIO14) de la NodeMCU.
const uint8_t kPinTemperatura = D5;
OneWire busTemperatura(kPinTemperatura);
DallasTemperature sensorTemperatura(&busTemperatura);

void setup() {
  Serial.begin(115200);
  delay(1000);
  sensorTemperatura.begin();
  Serial.print("Sensores DS18B20 detectados: ");
  Serial.println(sensorTemperatura.getDeviceCount());
}

void loop() {
  if (sensorTemperatura.getDeviceCount() == 0) {
    Serial.println("No se detecta el DS18B20. Revisa pines, 3V, GND y resistencia de 4.7k.");
    delay(2000);
    return;
  }

  sensorTemperatura.requestTemperatures();
  float celsius = sensorTemperatura.getTempCByIndex(0);

  if (celsius == DEVICE_DISCONNECTED_C) {
    Serial.println("No se pudo leer el DS18B20.");
  } else {
    Serial.print("Temperatura: ");
    Serial.print(celsius, 2);
    Serial.println(" C");
  }
  delay(2000);
}
