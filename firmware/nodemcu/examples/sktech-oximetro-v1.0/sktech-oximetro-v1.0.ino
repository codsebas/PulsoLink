#include <Wire.h>
#include "MAX30105.h"

MAX30105 sensor;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(D2, D1);

  if (!sensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("El MAX30102 no responde");
    while (true) delay(100);
  }

  sensor.setup(0x1F, 4, 2, 100, 411, 4096);
  Serial.println("Sensor listo. Coloca y retira el dedo.");
}
  
void loop() {
  Serial.print("IR: ");
  Serial.println(sensor.getIR());
  delay(250);
}