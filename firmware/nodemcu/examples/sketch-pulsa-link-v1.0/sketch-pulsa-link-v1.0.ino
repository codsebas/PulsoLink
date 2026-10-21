#include <Wire.h>

// Diagnostico del MAX30102: NodeMCU SDA=D2, SCL=D1.
const uint8_t kMaxAddress = 0x57;
const uint8_t kPartIdRegister = 0xFF;

bool readRegister(uint8_t address, uint8_t reg, uint8_t &value) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(address, (uint8_t)1) != 1) return false;
  value = Wire.read();
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(D2, D1);
  Wire.setClock(100000);
  Serial.println(F("Diagnostico I2C de PulsoLink"));
}

void loop() {
  bool found = false;
  Serial.print(F("Direcciones I2C:"));
  for (uint8_t address = 1; address < 127; ++address) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.print(F(" 0x"));
      if (address < 16) Serial.print('0');
      Serial.print(address, HEX);
      found = true;
    }
    yield();
  }
  if (!found) Serial.print(F(" ninguna"));
  Serial.println();

  uint8_t partId = 0;
  if (readRegister(kMaxAddress, kPartIdRegister, partId)) {
    Serial.print(F("MAX30102 ID=0x"));
    if (partId < 16) Serial.print('0');
    Serial.println(partId, HEX);  // Esperado: 0x15.
  } else {
    Serial.println(F("MAX30102: no se pudo leer el ID en 0x57"));
  }
  delay(3000);
}
