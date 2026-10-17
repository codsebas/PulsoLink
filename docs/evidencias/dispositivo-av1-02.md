# AV1-02 — Recepción Autenticada de Mediciones por API (@codsebas)

Fecha de verificación: 16 de octubre de 2026, hora de Guatemala. Issue relacionado: [#4](https://github.com/codsebas/PulsoLink/issues/4).

---

## 1. Entorno y Resultado

- **Sistema:** Windows / PowerShell, Node.js 24 LTS, npm workspaces.
- **Ramas:** `feat/device-ingestion` derivada de `main` (que consolida persistencia Firestore #15, base web #16, dashboard #14, autenticación #17 y QA #18).
- **Herramientas de prueba:** Vitest 3.2.7, Supertest 7.0.0, TypeScript 5.7.3.
- **Estado de pruebas:** **90 pruebas aprobadas en 10 archivos** (incluyendo 23 pruebas de endpoints del dispositivo en `test/device-api.test.ts`), 0 fallos.
- **Verificación de tipos y compilación:** `npm run typecheck` y `npm run build` completados con código 0 en todos los workspaces (`apps/api`, `apps/web`, `tools/device-simulator`).

---

## 2. Comandos Ejecutados

Desde la raíz del monorepositorio en PowerShell:

```powershell
npm run typecheck
npm run test --workspace=apps/api
npm run build
git diff --check
```

Resultados:
- `npm run typecheck`: **0 errores de tipo** en `apps/api`, `apps/web` y `tools/device-simulator`.
- `npm run test --workspace=apps/api`: **10 suites aprobadas**, 90 pruebas superadas, 8 pruebas de emulador omitidas por ausencia de emuladores locales en ejecución.
- `npm run build`: `apps/api` (rimraf dist && tsc), `apps/web` (vite build para producción con 1652 módulos) y `tools/device-simulator` compilados exitosamente.
- `git diff --check`: Sin conflictos de espacios en blanco ni caracteres corruptos.

---

## 3. Criterios de Aceptación Cumplidos

| Criterio | Estado | Evidencia técnica observable |
| --- | :---: | --- |
| **Credencial incorrecta devuelve 401; muestra válida se guarda y devuelve 201** | **Aprobado** | - Cabecera ausente, formato sin `Bearer ` o token desconocido/revocado/deshabilitado responde `401 UNAUTHORIZED`.<br>- Muestra válida responde `201 Created` con `{ data: { measurementId, receivedAt, duplicate: false } }`. |
| **Repetición idéntica devuelve 200 sin duplicar; misma clave y contenido distinto devuelve 409** | **Aprobado** | - Reintento con clave compuesta `deviceId + bootId + sequence` y mismo payload responde `200 OK` con `{ duplicate: true }`.<br>- Muestra con misma secuencia y contenido alterado lanza `PersistenceError('IDEMPOTENCY_CONFLICT')` y responde `409 Conflict`. |
| **Muestra nueva para sesión finalizada devuelve 409; repetir guardada conserva respuesta idempotente** | **Aprobado** | - Muestra para sesión en estado `finished` o inactiva lanza `PersistenceError('SESSION_NOT_ACTIVE')` y responde `409 Conflict`.<br>- Reintento de muestra previamente persistida responde `200 OK` con `duplicate: true` incluso tras finalizar la sesión. |
| **Configuración y heartbeat funcionan sin exponer secretos** | **Aprobado** | - `GET /api/v1/device/config` responde `200` con `deviceId`, `activeSessionId`, `uploadIntervalMs: 2000`, `heartbeatIntervalMs: 15000` y `serverTime`. Sin secretos ni hashes.<br>- `POST /api/v1/device/heartbeat` actualiza `lastSeenAt` y responde `200` con `{ status: 'ok', serverTime }`. |

---

## 4. Componentes Implementados

1. **`apps/api/src/modules/devices/device-auth.middleware.ts`**:
   - Middleware de autenticación Bearer para Contrato A.
   - Extrae el token `<credentialId>.<secret>`, valida el formato y utiliza `DeviceCredentialsRepository.authenticate(token)` con comparación en tiempo constante (`timingSafeEqual`) de hash SHA-256.
   - Inyecta `req.device` tipado en la interfaz `Express.Request`.
   - Deniega credenciales inválidas, deshabilitadas o revocadas con `401 UNAUTHORIZED`.

2. **`apps/api/src/modules/measurements/device-measurements.router.ts`**:
   - Router modular con inyección de dependencias para los repositorios de credenciales, dispositivos y mediciones.
   - Esquemas de validación Zod estrictos (`heartbeatInputSchema`, `measurementInputSchema`).
   - Control de límites de carga útil (8 KiB) y rechazo de campos no autorizados (como `deviceId` inyectado en el cuerpo).
   - Manejo de respuestas y DTOs según el Contrato A.

3. **`apps/api/src/modules/measurements/measurements.repository.ts`**:
   - Exportación de `measurementInputSchema` para compartir la validación formal de signos vitales (pulso > 0 y ≤ 300 bpm, SpO₂ 0-100%, temperatura -55 a 125 °C; valores nulos obligatorios ante estados de falta de contacto óptico).

4. **`apps/api/src/middleware/error-handler.ts`**:
   - Mapeo centralizado de `PersistenceError` hacia códigos HTTP estándar: `IDEMPOTENCY_CONFLICT` (409), `SESSION_NOT_ACTIVE` (409), `DEVICE_DISABLED` (401), `DEVICE_NOT_FOUND` (404), `SESSION_NOT_FOUND` (404), `INVALID_CURSOR` (400), `AUTH_USER_DISABLED` (403).

5. **`contracts/device.openapi.yaml`**:
   - Actualización de los endpoints `/device/config`, `/device/heartbeat` y `/device/measurements` a estado `[IMPLEMENTADO - Issue #4 (@codsebas)]`.

6. **`apps/api/test/device-api.test.ts`**:
   - Suite completa de 23 pruebas unitarias y de integración que ejercitan todos los flujos del Contrato A y casos de borde.

---

## 5. Coordinación y Próximos Pasos

- **Para `@HugoX2024` (Issue #7 - Simulador IoT):** El simulador puede conectarse directamente a `http://localhost:3001/api/v1/device` enviando cabecera `Authorization: Bearer <credentialId>.<secret>`, consultando `/config`, reportando `/heartbeat` cada 15 segundos y enviando `/measurements` cada 2 segundos.
- **Para `@DidhyerOrtiz` / `@DidhyerOrtizG` (Issue #5 - API de sesiones):** Los endpoints de sesiones interactúan con las mismas reservas y transacciones de Firestore Standard.
- **Para `@codsebas` (Issue #12 - Firmware NodeMCU ESP8266):** El microcontrolador físico utilizará el mismo contrato HTTP POST y autenticación Bearer validada en esta entrega.
