# PulsoLink — Guía de Contratos de API REST

> **Versión objetivo:** [contrato aprobado](../arquitectura/contrato-aprobado-2026-10-18.md), [plan vigente](../planificacion/ejecucion-2026-10-18.md) y OpenAPI [A](../../contracts/device.openapi.yaml) / [B](../../contracts/web.openapi.yaml) 2.0.0. La guía detallada que sigue documenta la API del primer avance; hoy las rutas de sesiones y dispositivos ya están implementadas bajo su contrato anterior. Los módulos de pacientes, asignaciones y auditoría aún no están programados.

Este documento consolida la arquitectura de comunicación, los contratos formales y el estado de implementación de la API de **PulsoLink**.

Para comprobar únicamente recepción de JSON por LAN, consultar la [prueba temporal `POST /api/v1/dev/reading-test`](reading-test.md). Solo existe en desarrollo, sin autenticación ni persistencia; está separada del contrato final de ingestión y no modifica `/api/v1/device/measurements`.

---

## 1. Visión General de los Contratos

La plataforma desacopla la comunicación en dos contratos independientes según el origen y los requisitos de seguridad:

```
┌────────────────────────────────┐         ┌───────────────────────────────┐
│       Dispositivo Físico       │         │        Frontend Web SPA       │
│     (NodeMCU ESP8266 IoT)      │         │     (React + TypeScript)      │
│               o                │         │                               │
│      Simulador de Telemetría   │         │                               │
└───────────────┬────────────────┘         └───────────────┬───────────────┘
                │                                          │
                │ Contrato A                               │ Contrato B
                │ (Bearer Token Criptográfico)             │ (Cookies HttpOnly + CSRF)
                ▼                                          ▼
     ┌──────────────────────────────────────────────────────────┐
     │                API Backend REST (Express 5)              │
     │                      Prefijo /api/v1                     │
     └──────────────────────────┬───────────────────────────────┘
                                │ Firebase Admin SDK
                                ▼
     ┌──────────────────────────────────────────────────────────┐
     │               Cloud Firestore Standard (DB)              │
     │            + Firebase Authentication (Identidad)         │
     └──────────────────────────────────────────────────────────┘
```

---

## 2. Contrato A: Dispositivo IoT / Simulador ↔ Backend API

* **Especificación OpenAPI 3.1:** [`contracts/device.openapi.yaml`](../../contracts/device.openapi.yaml)
* **Autenticación:** Cabecera `Authorization: Bearer <credentialId>.<secret>`
* **Seguridad:** El secreto es de alta entropía (32 bytes base64url). El servidor almacena el hash SHA-256 y lo verifica en tiempo constante (`timingSafeEqual`).
* **Límite de carga útil:** Máximo 8 KiB por petición.
* **Estado:** **100% DEFINIDO E IMPLEMENTADO** (Issue #4 / @codsebas en PR #19).

### Endpoints del Contrato A

| Método | Ruta | Descripción | Estado en Backend |
| --- | --- | --- | :---: |
| `GET` | `/api/v1/health` | Verificación de salud del proceso y estado de conexión Firebase | ✅ Implementado |
| `GET` | `/api/v1/device/config` | Consulta de intervalo de envío (2000 ms), heartbeat (15000 ms) y sesión activa (`activeSessionId`) | ✅ Implementado |
| `POST` | `/api/v1/device/heartbeat` | Reporte periódico de presencia y tiempo de actividad (`uptimeMs`, `bootId`) | ✅ Implementado |
| `POST` | `/api/v1/device/measurements` | Ingestión transaccional e idempotente de signos vitales (pulso, SpO₂, temperatura) | ✅ Implementado |

### Reglas de Idempotencia del Contrato A
- **Clave compuesta única:** `deviceId + bootId + sequence`.
- **Muestra idéntica repetida:** Responde `200 OK` con `{ duplicate: true }` sin duplicar documentos en Firestore.
- **Misma clave con métricas alteradas:** Responde `409 Conflict` con código `IDEMPOTENCY_CONFLICT`.
- **Muestra para sesión finalizada o inactiva:** Responde `409 Conflict` con código `SESSION_NOT_ACTIVE`.
- **Reintento de muestra guardada tras finalizar sesión:** Conserva la respuesta idempotente `200 OK` (`duplicate: true`).

---

## 3. Contrato B: Frontend Web ↔ Backend API

* **Especificación OpenAPI 3.1:** [`contracts/web.openapi.yaml`](../../contracts/web.openapi.yaml)
* **Autenticación e Identidad:**
  - Cookies de sesión `pulsolink_session` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` en HTTPS).
  - Verificación de credenciales contra Firebase Authentication REST en el servidor.
* **Protección CSRF:**
  - `GET /api/v1/auth/csrf` emite la cookie `pulsolink_csrf` y devuelve `data.csrfToken`.
  - Todas las mutaciones web (`POST`, `PUT`, `DELETE`) deben incluir la cabecera `X-CSRF-Token` y comprobar el origen del navegador.
* **Paginación:** Cursor opaco (`limit` entre 1 y 100, predeterminado 50).
* **Guía técnica de Auth:** [`docs/auth.md`](../auth.md).

### Endpoints del Contrato B

| Método | Ruta | Descripción | Estado en Backend |
| --- | --- | --- | :---: |
| `GET` | `/api/v1/auth/csrf` | Entrega de token CSRF y cookie para mutaciones | ✅ Implementado (Issue #10) |
| `POST` | `/api/v1/auth/login` | Inicio de sesión con correo y contraseña; establece cookie de sesión | ✅ Implementado (Issue #10) |
| `POST` | `/api/v1/auth/logout` | Cierre de sesión y eliminación de cookie | ✅ Implementado (Issue #10) |
| `GET` | `/api/v1/auth/me` | Consulta de perfil del operador/administrador autenticado | ✅ Implementado (Issue #10) |
| `GET` | `/api/v1/devices` | Lista paginada de dispositivos IoT habilitados | ⏳ Asignado a @Didhyer (Issue #5) |
| `GET` | `/api/v1/sessions` | Listado paginado de sesiones con filtros por estado y fecha | ⏳ Asignado a @Didhyer (Issue #5) |
| `POST` | `/api/v1/sessions` | Creación de sesión (`participantCode`, `deviceId`) en estado `created` | ⏳ Asignado a @Didhyer (Issue #5) |
| `POST` | `/api/v1/sessions/:id/start` | Iniciar sesión: pasa a `active` y reserva el dispositivo atómicamente | ⏳ Asignado a @Didhyer (Issue #5) |
| `POST` | `/api/v1/sessions/:id/finish` | Finalizar sesión: pasa a `finished` y libera el dispositivo | ⏳ Asignado a @Didhyer (Issue #5) |
| `GET` | `/api/v1/sessions/:id/latest` | Consulta de la última lectura para el dashboard en tiempo real | ⏳ Asignado a @Didhyer (Issue #5) |
| `GET` | `/api/v1/sessions/:id/measurements` | Historial paginado por cursor de lecturas de la sesión | ⏳ Asignado a @Didhyer (Issue #5) |

*(Nota: En la capa de persistencia de Firestore, los repositorios de `SessionsRepository` y `DevicesRepository` ya fueron completamente implementados y probados en PR #15 por @gioore. Únicamente falta que @Didhyer conecte las rutas de Express en `apps/api/src/modules/sessions/sessions.routes.ts` y `devices.routes.ts` bajo el Issue #5).*

---

## 4. Estructura de Respuestas y Errores Estándar

### Respuesta Exitosa Individual
```json
{
  "data": {
    "id": "ses-001",
    "participantCode": "P-001",
    "status": "active"
  }
}
```

### Respuesta Exitosa con Paginación
```json
{
  "data": [ ... ],
  "pagination": {
    "nextCursor": "eyJ2ZXJzaW9uIjoxLCJzY29wZSI6ImYyYS4uLiJ9",
    "hasMore": true
  }
}
```

### Respuesta de Error Unificada
```json
{
  "error": {
    "code": "SESSION_NOT_ACTIVE",
    "message": "La sesión no está activa para este dispositivo.",
    "requestId": "req-1729221000000",
    "details": []
  }
}
```

---

## 5. Reglas de Calidad Biomédica y Rigor Académico

1. **Valores nulos vs cero:** Si un sensor no tiene contacto o el dato no está disponible, el valor debe ser `null`. Jamás se debe inventar un cero (`0`).
2. **Temperatura periférica:** La lectura del DS18B20 TO-92 se realiza en la piel del dedo, no representa temperatura central corporal.
3. **SpO₂ estimada:** Es una aproximación académica basada en fotopletismografía reflectiva (MAX30102).
4. **Estados de calidad:** Se distinguen rigurosamente:
   - `valid`: lectura dentro de límites técnicos con contacto óptico adecuado.
   - `no_contact`: dedo retirado del sensor óptico (valores en `null`).
   - `invalid`: valor fuera de límites físicos.
   - `unavailable`: sensor no conectado o lectura no disponible.
