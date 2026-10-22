# Prueba del simulador contra Render y Firestore

## Estado comprobado el 22 de octubre de 2026

- Node 24.22.1: compilación del simulador y **32 pruebas aprobadas**.
- `https://pulsolink-api.onrender.com/api/v1/health`: HTTP 200, Firebase en modo `cloud`.
- Prueba integral con la cuenta de pruebas `sebas@pulsolink.test`: **PASS, 27 comprobaciones**, incluyendo login administrativo, diez respuestas HTTP 201 y lectura independiente de los diez documentos en Firestore.
- Reenvío idéntico: HTTP 200, `duplicate: true`, mismo ID y diez lecturas totales en el historial.
- Sesión finalizada y asignación cerrada correctamente. El paciente, dispositivo simulado e historial se conservaron para inspección.
- El primer intento falló con otra credencial privada (`401` / `INVALID_LOGIN_CREDENTIALS`), antes de crear datos. Se resolvió usando la cuenta indicada por el coordinador del proyecto; no se cambiaron contraseñas.

Evidencia de la ejecución aprobada:

| Recurso | Identificador |
| --- | --- |
| Paciente ficticio | `s83m3w5kub9EFnAzPErp` |
| Dispositivo simulado | `rj1dEK4IOcl4y2J3PMfW` |
| Asignación cerrada | `mTXokF46plGCEvEbyB7C` |
| Sesión finalizada | `HIdV39VVJXxE2iOlpAD8` |

[Abrir el historial del paciente de prueba](https://pulsolink-api.onrender.com/monitoring/s83m3w5kub9EFnAzPErp), iniciando sesión con una cuenta autorizada.

El resultado de la última ejecución está en `.cache/render-simulator-results.json`, ignorado por Git. El estado `cloud` del health por sí solo no demuestra una escritura correcta en Firestore.

## Qué se agrega y qué se necesita

El emisor existente en `tools/device-simulator/` ya implementa el Contrato A. No hace falta otro emisor, otro servidor ni cambiar el firmware para esta prueba.

Se agrega `tools/firebase/verify-render-simulator.cjs`, un coordinador de pruebas del backend. Usa la API web para preparar paciente ficticio, placa de origen `simulated`, asignación y sesión; usa Firebase Admin para aprovisionar la credencial y comprobar los documentos guardados. El simulador conserva exclusivamente HTTP y nunca recibe una cuenta de servicio.

Requisitos locales:

1. Node 24 y dependencias instaladas desde la raíz del repositorio.
2. `apps/api/.env` privado con `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY` y credenciales administrativas válidas para el proyecto de pruebas. `GOOGLE_APPLICATION_CREDENTIALS` debe apuntar a un JSON local existente, fuera del repositorio. No usar emuladores.
3. Una cuenta **admin existente, habilitada y con perfil administrativo**. El archivo privado de cuentas debe contener su correo y contraseña vigentes. No pegarlos en el chat.
4. API desplegada conectada al mismo proyecto y con origen HTTPS permitido para el flujo web.

El archivo de cuentas predeterminado está fuera del repositorio:

```text
%LOCALAPPDATA%\PulsoLink\pulsolink-pruebas-2026-7c8a31\cuentas-pruebas.json
```

Acepta un objeto o un arreglo de objetos con `email`, `password`, `role: "admin"` y opcionalmente `projectId`. Si se cambió la contraseña en Firebase, actualizar también este archivo local. Un 401 no se corrige cambiando el secreto del dispositivo ni CORS.

La ejecución aprobada utilizó `cuenta-admin-render.json` en el mismo directorio privado, protegido para el usuario local y SYSTEM. Los comandos siguientes seleccionan ese archivo explícitamente y no imprimen su contenido.

## Ejecutar desde la raíz en PowerShell

Con Node 24 activo (`node --version` debe mostrar `v24...`):

```powershell
npm run build --workspace=apps/api
npm run build --workspace=tools/device-simulator
npm test --workspace=tools/device-simulator
$env:RENDER_VERIFY_ALLOW_WRITES='true'
$env:RENDER_VERIFY_PROJECT_ID='pulsolink-pruebas-2026-7c8a31'
$env:RENDER_VERIFY_ACCOUNTS_FILE=Join-Path $env:LOCALAPPDATA 'PulsoLink\pulsolink-pruebas-2026-7c8a31\cuenta-admin-render.json'
node tools/firebase/verify-render-simulator.cjs
```

Si el Node global sigue en otra versión, estos comandos seleccionan Node 24 también para los procesos de compilación y pruebas:

```powershell
npx --yes --package=node@24 --call 'npm run build --workspace=apps/api && npm run build --workspace=tools/device-simulator && npm test --workspace=tools/device-simulator'
$env:RENDER_VERIFY_ALLOW_WRITES='true'
$env:RENDER_VERIFY_PROJECT_ID='pulsolink-pruebas-2026-7c8a31'
$env:RENDER_VERIFY_ACCOUNTS_FILE=Join-Path $env:LOCALAPPDATA 'PulsoLink\pulsolink-pruebas-2026-7c8a31\cuenta-admin-render.json'
npx --yes --package=node@24 node tools/firebase/verify-render-simulator.cjs
```

El coordinador apunta por defecto a `https://pulsolink-api.onrender.com/api/v1` y rechaza otros proyectos Firebase. Para otro archivo privado de cuentas se admite `RENDER_VERIFY_ACCOUNTS_FILE` con ruta absoluta fuera del repositorio y OneDrive. No subir ninguno de estos archivos privados a Git.

## Qué comprobará cuando el login funcione

1. Salud pública y autenticación administrativa mediante cookies y CSRF reales.
2. Creación de un paciente ficticio y dispositivo simulado exclusivos de esta ejecución. Lectura independiente en Firestore para comprobar que API y coordinador apuntan al mismo proyecto.
3. Aprovisionamiento de una credencial propia del dispositivo, asignación al paciente e inicio de sesión de monitoreo.
4. Ejecución del **simulador existente** contra Render, hasta diez respuestas de medición HTTP 201, con límite de 90 segundos para esta fase.
5. Reenvío controlado de la última petición idéntica: HTTP 200, `duplicate: true` y mismo ID. Es una prueba de idempotencia, sin introducir una cola en el emisor.
6. Consulta del historial por API: diez documentos, sin una lectura adicional por el duplicado.
7. Lectura independiente de esos diez documentos en `sessions/{sessionId}/measurements/{measurementId}`. Comparación de `patientId`, `deviceId`, `assignmentId`, `sessionId`, `source: simulated`, `bootId`, `sequence`, mediciones y fecha recibida.
8. Finalización de la sesión y cierre de la asignación creadas por la prueba. Se conservan paciente, dispositivo, credencial e historial para inspección; cada repetición crea otro fixture. El coordinador informa si el cierre falla.

Guarda el informe sin secretos en `.cache/render-simulator-results.json` y la credencial del dispositivo en un JSON protegido dentro del directorio privado anterior. Si todavía no existe `tools/device-simulator/.env`, también lo crea con la URL HTTPS y las credenciales del fixture; nunca sobrescribe un `.env` existente. No se requiere otro despliegue para ejecutar el coordinador local.

## Verlo en la web y volver a enviar

Tras una ejecución aprobada, el informe incluye `monitoringUrl` para abrir el paciente en la web con una cuenta autorizada. Las lecturas del ensayo quedan en el historial. La sesión estará finalizada, por lo que el estado posterior puede indicar falta de lecturas recientes.

Para enviar continuamente desde el CLI, primero crear una nueva asignación y sesión activa para ese dispositivo desde la administración web. Verificar que el `.env` del simulador corresponde a ese dispositivo; si ya existía, el coordinador no lo reemplazó. Después:

```powershell
npx --yes --package=node@24 --call 'npm start --workspace=tools/device-simulator'
```

Detener con Ctrl+C. Sin sesión activa, el simulador solo consulta configuración y envía heartbeat; no genera historial. Las muestras producidas sin conexión se descartan.

Esta prueba cubre ingestión pública normal, deduplicación y persistencia. No certifica todavía todos los modos de calidad, cortes de red contra Render, la interfaz visual completa ni el hardware. El sketch v1.2 sigue pendiente de adaptación a HTTPS, autenticación del dispositivo y endpoints oficiales antes de probar la placa física.
