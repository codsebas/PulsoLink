# PulsoLink — Guía para Agentes y Desarrolladores

Instrucciones operativas para agentes de inteligencia artificial y desarrolladores que colaboren en el repositorio **PulsoLink**.

**Alcance vigente (revisado el 19 de octubre de 2026):** leer el [contrato aprobado](docs/arquitectura/contrato-aprobado-2026-10-18.md) y el [plan de ejecución](docs/planificacion/ejecucion-2026-10-18.md) antes de modificar contratos o código. Los OpenAPI 2.0.0 describen el objetivo pendiente de implementación bajo `/api/v1`; el código anterior aún conserva `operator` y `participantCode`. En el modelo objetivo, el historial pertenece al paciente y cada lectura conserva `patientId`, `deviceId`, `assignmentId` y `sessionId` fijados por el backend. El rol objetivo `viewer` solo consulta; administración y auditoría exigen `admin`. Migrar `operator` explícitamente, sin elevarlo a admin. Firmware y simulador deberán descartar muestras producidas sin conexión, sin cola de reenvío.

---

## 1. Stack y Arquitectura Central

- **Frontend:** React + TypeScript + Vite, estilizado con Tailwind CSS, navegación con React Router, estado remoto gestionado con TanStack Query y visualización con Recharts.
- **Backend:** Node.js 24 LTS + Express 5 + TypeScript con esquemas de validación Zod.
- **Base de datos e Identidad:** Cloud Firestore (edición **Standard**) y Firebase Authentication (proveedor correo/contraseña).
- **Acceso a Firestore:** Exclusivamente en el backend mediante **Firebase Admin SDK**. Se deniega el acceso directo de clientes a Firestore.
- **Comunicación cliente-servidor:**
  - **Contrato A:** Dispositivo IoT / Simulador ↔ API Backend (autenticación vía cabecera `Authorization: Bearer <credentialId>.<secret>`).
  - **Contrato B:** Frontend Web ↔ API Backend (cookies de sesión `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` en HTTPS, con verificación de token CSRF y validación de roles en la API).
- **Regla estricta de stack:** No introducir PostgreSQL, Prisma, Firebase SQL Connect, Next.js, React Server Components ni llamadas directas del frontend a los SDKs cliente de Firebase para acceso a datos.

---

## 2. Responsabilidades del Equipo y Hardware

- **`@codsebas`:** Responsable del dispositivo físico (NodeMCU ESP8266, MAX30102, DS18B20 TO-92) y coordinación técnica de integración.
- **`@HugoX2024`:** Implementación del simulador IoT en `tools/device-simulator/` (Node.js/TypeScript) según Contrato A, sin credenciales de administración Firebase.
- **`@AxelHerrera11`:** Estructura frontend, rutas, layout base y componentes reutilizables.
- **`@DidhyerOrtiz` / `@DidhyerOrtizG`:** API REST de dispositivos y sesiones (Express, validación y ciclo de vida de sesiones).
- **`@gioore`:** Firebase y persistencia (Firestore Standard, colecciones, repositorios, transacciones atómicas, índices y reglas de seguridad).
- **`@Mar-03`:** Autenticación y autorización (flujo de login/logout, cookies de sesión seguras, protección CSRF, roles y script de aprovisionamiento).
- **`@Javifa2324`:** Monitoreo (Dashboard, visualización de tendencias con Recharts, estados de calidad e indicadores).
- **`@Lis671`:** Vistas de sesiones, listado de dispositivos, filtros e historial con paginación por cursor.
- **`@orem6`:** Integración, calidad, pruebas del recorrido, evidencias reproducibles y preparación del despliegue.

*Nota de hardware:* La descripción del hardware principal contempla NodeMCU ESP8266, MAX30102 y DS18B20 TO-92. Cualquier evaluación de ESP32 o Raspberry Pi se mantiene como pendiente técnico sin asumir equivalencia automática.

---

## 3. Skills del Repositorio (`.agents/skills/`)

El proyecto versiona siete skills compartidas en `.agents/skills/`. Cada colaborador o agente debe cargar únicamente las pertinentes a la tarea en curso:

| Skill | Ámbito principal | Asignación de uso |
| --- | --- | --- |
| `firebase-basics` | Inicialización de Firebase CLI, proyectos y emuladores | `@gioore` |
| `firebase-firestore` | Modelado de documentos, consultas, transacciones e índices | `@gioore`, `@DidhyerOrtiz` |
| `firebase-auth-basics` | Autenticación y gestión de usuarios (adaptado a API/cookies) | `@Mar-03`, `@DidhyerOrtiz` |
| `firestore-rules-creation` | Reglas de Firestore (bloqueo de acceso cliente directo) | `@gioore`, `@orem6` |
| `vercel-react-best-practices` | Rendimiento, hooks y buenas prácticas en React SPA | `@AxelHerrera11`, `@Javifa2324`, `@Lis671`, `@Mar-03` |
| `web-design-guidelines` | Accesibilidad, formularios, usabilidad y estados UI | `@AxelHerrera11`, `@Javifa2324`, `@Lis671`, `@orem6` |
| `playwright-cli` | Inspección de navegación web y evidencias de recorrido | `@orem6`, `@HugoX2024` (verificación puntual) |

---

## 4. Reglas Críticas para Agentes

1. **Contratos antes de código:** Leer el [README.md](README.md) y los contratos correspondientes antes de alterar cualquier endpoint o esquema de datos.
2. **Autoridad del proyecto:** No sustituir las decisiones arquitectónicas de PulsoLink por los valores predeterminados de una skill externa (por ejemplo, elegir siempre Firestore Standard en vez de Enterprise; no usar Next.js).
3. **Seguridad y reglas de Firestore:** Recordar que Firebase Admin SDK ignora las Security Rules en el servidor. La API de Express debe validar explícitamente autenticación, roles, propiedad y estados de sesión. Denegar todo acceso directo de clientes en las reglas de Firestore.
4. **Idempotencia y consistencia en ingestión:** Respetar la clave única `deviceId + bootId + sequence`. Las peticiones duplicadas idénticas deben devolver 200 con `duplicate: true` sin añadir registros redundantes; modificaciones de carga útil con misma clave deben responder 409 (`IDEMPOTENCY_CONFLICT`).
5. **Exactitud y honestidad médica/académica:**
   - La temperatura medida es superficial (dedo), no temperatura central corporal.
   - La SpO₂ es una estimación académica sujeta a calibración y contacto.
   - Las tendencias de pulso son gráficas de valores puntuales, nunca una onda PPG de alta frecuencia ni un electrocardiograma (ECG).
   - Distinguir rigurosamente entre: dato válido (`valid`), falta de contacto óptico (`no_contact`), dato no disponible (`unavailable`), dato inválido (`invalid`) y dispositivo desactualizado (`stale`).
6. **Muestreo vs. Envío:** La frecuencia de adquisición física del sensor es independiente del intervalo de reporte periódico (2 segundos) hacia la API.
7. **Gestión de secretos:** Nunca incluir credenciales, claves privadas, archivos de cuentas de servicio, tokens ni `.env` en Git. No imprimir valores sensibles en terminales o logs.
8. **Entorno Windows y PowerShell:** Al sugerir o ejecutar comandos, usar PowerShell con rutas entrecomilladas cuando contengan espacios. No usar sintaxis exclusiva de Bash sin verificar su equivalencia en PowerShell.
9. **Verificación honesta:** Diferenciar entre archivos presentes, reconocimiento por el agente y ejecución de herramientas nativas. No reportar como "probado" o "verificado" aquello que no se haya ejecutado con evidencia real.
10. **Flujo de trabajo:** Cada tarea se desarrolla en su rama correspondiente (`feat/*`, `chore/*`, `fix/*`). Las modificaciones de contratos o skills se coordinan mediante Pull Requests.
