# PulsoLink — Documentación de Hardware y Sensores

Índice técnico de conexiones, especificaciones eléctricas, sensores y decisiones de montaje del dispositivo telemétrico.

- **Responsable:** `@codsebas` (Issue #12 / AV1-10).

---

## 1. Especificaciones de Componentes

### 1.1 Microcontrolador Principal: NodeMCU v3 (ESP8266)
- **Procesador:** Tensilica L106 32-bit a 80/160 MHz.
- **Conectividad:** Wi-Fi 802.11 b/g/n (2.4 GHz).
- **Alimentación:** 5V vía micro-USB / pin `VIN` (regulador interno a 3.3V).
- **Voltaje lógico:** 3.3V (¡Atención: entradas no tolerantes a 5V sin divisor!).

### 1.2 Sensor Óptico de Pulso y Oxímetro: MAX30102
- **Comunicación:** Bus I2C.
- **Pines habituales en NodeMCU:**
  - `SDA`: Pin `D2` (GPIO 4).
  - `SCL`: Pin `D1` (GPIO 5).
  - `VIN`: 3.3V o 5V según el regulador de la placa de desarrollo.
  - `GND`: Tierra común.
- **Naturaleza de la lectura:** Estimación académica de SpO₂ y frecuencia cardíaca mediante fotopletismografía superficial. Sujeto a contacto y estabilidad.

### 1.3 Sensor de Temperatura Superficial: DS18B20 (Encapsulado TO-92)
- **Comunicación:** Bus 1-Wire.
- **Pines habituales en NodeMCU:**
  - `DATA`: Pin `D4` (GPIO 2) con resistencia pull-up de 4.7 kΩ hacia 3.3V.
  - `VDD`: 3.3V.
  - `GND`: Tierra común.
- **Naturaleza de la lectura:** Temperatura de contacto superficial (dedo/piel), NO temperatura central corporal.

---

## 2. Decisiones de Hardware y Pendientes Técnicos

1. **Evaluación de microcontroladores:** La plataforma acordada es **NodeMCU ESP8266**. Cualquier migración hacia ESP32 o Raspberry Pi se mantiene como análisis técnico pendiente; no se asume equivalencia automática debido a diferencias en pines, librerías, niveles lógicos y consumo eléctrico.
2. **Alimentación y desacoplo:** Diseñar un riel estable de 3.3V para evitar caídas de tensión durante las ráfagas de transmisión Wi-Fi del ESP8266 que puedan inducir ruido en el MAX30102.
3. **Muestreo vs. Envío:** La tasa de muestreo del sensor óptico es independiente de la periodicidad de reporte telemétrico (cada 2 segundos) hacia el backend.
