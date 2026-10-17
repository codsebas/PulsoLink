# PulsoLink — Firmware NodeMCU ESP8266

Código fuente, cabeceras y ejemplos de configuración para el dispositivo telemétrico físico.

- **Responsable exclusivo:** `@codsebas` (Issue #12 / AV1-10).
- **Documentación de hardware y conexiones:** Consulte [docs/hardware/README.md](../../docs/hardware/README.md).

---

## 1. Organización del Código

```text
firmware/nodemcu/
├── README.md              # Este documento explicativo
├── src/                   # Código fuente C++ / Arduino / PlatformIO
├── include/               # Archivos de cabecera (.h)
└── examples/              # Ejemplos de conexión Wi-Fi y lecturas mínimas
```

---

## 2. Decisiones de Hardware y Pendientes

- **Hardware base actual:** NodeMCU ESP8266 (Wi-Fi 802.11 b/g/n), sensor óptico MAX30102 (I2C) y sensor de temperatura superficial DS18B20 TO-92 (1-Wire).
- **Evaluación pendiente:** Cualquier propuesta sobre ESP32 o Raspberry Pi se mantiene en evaluación técnica sin asumir equivalencia automática. La confirmación final de la plataforma y el entorno de compilación (Arduino IDE vs. PlatformIO) se definirá por el coordinador antes de implementar las lecturas finales de los sensores.
- **Contrato con la API:** La transmisión de datos se adhiere de forma estricta a las especificaciones del **Contrato A** (`contracts/device.openapi.yaml`), utilizando la cabecera `Authorization: Bearer <credentialId>.<secret>` y un intervalo de reporte de 2 segundos.
