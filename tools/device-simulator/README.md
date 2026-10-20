# PulsoLink — Simulador IoT de Dispositivo

> **Alcance objetivo:** El [contrato aprobado](../../docs/arquitectura/contrato-aprobado-2026-10-18.md) y el [plan vigente](../../docs/planificacion/ejecucion-2026-10-18.md) definen el objetivo del simulador bajo Contrato A 2.0.0. El código actual es un esqueleto; debe adaptarse al contrato nuevo y descartar muestras producidas sin conexión.

Herramienta en Node.js y TypeScript para simular la transmisión periódica de mediciones telemétricas de signos vitales hacia el backend de PulsoLink, conforme a las especificaciones del **Contrato A**.

- **Responsable asignado:** `@HugoX2024` (Issue #7).
- **Ubicación:** `tools/device-simulator/`.

---

## 1. Responsabilidades del Módulo

1. Consultar periódicamente `GET /api/v1/device/config` con la cabecera `Authorization: Bearer <credentialId>.<secret>`.
2. Enviar heartbeat periódico mediante `POST /api/v1/device/heartbeat`.
3. Cuando exista una sesión activa asignada al dispositivo (`activeSessionId` no nulo), transmitir las 3 magnitudes cada 2 segundos mediante `POST /api/v1/device/measurements`:
   - Frecuencia cardíaca (`heartRate`: bpm).
   - SpO₂ estimada (`spo2`: %).
   - Temperatura superficial (`skinTemperature`: °C).
4. Generar un `bootId` único por arranque y número de secuencia monotónicamente creciente para garantizar idempotencia.
5. Permitir alternar escenarios:
   - **Normal:** mediciones con status `valid`.
   - **Sin contacto óptico:** `heartRate` y `spo2` con status `no_contact` y valor `null`, conservando `skinTemperature` disponible.
   - **Desconexión:** suspender transmisión y heartbeat para evidenciar estado `stale` en la API.
6. Sin credenciales de administración de Firebase ni acceso directo a la base de datos (todo pasa por la API de Express).
