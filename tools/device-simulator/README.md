# PulsoLink — simulador IoT (Contrato A 2.0.0)

Responsables: HugoX2024 y codsebas, issue #44. Node.js 24.15.0 + TypeScript; solo HTTP REST, sin SDK de Firebase ni acceso directo a Firestore.

Implementa config, heartbeat y mediciones serializadas. El backend fija paciente, asignación y origen; registrar la placa como `simulated`. La API integrada en main `abc4d45` acepta el contrato oficial. La regresión HTTP y la demostración del CLI contra API/Firestore/web se documentan en la [aceptación integrada](../../docs/evidencias/hugo-integrado-2026-10-21.md).

## Ejecutar

Desde raíz PowerShell:

```powershell
npm ci
Copy-Item tools/device-simulator/.env.example tools/device-simulator/.env
# Completar .env con la credencial de prueba aprovisionada por el backend.
npm run dev --workspace=tools/device-simulator
```

Alternativa compilada:

```powershell
npm run build --workspace=tools/device-simulator
npm start --workspace=tools/device-simulator
```

También se pueden ejecutar `npm run dev` y `npm start` dentro de `tools/device-simulator/`. `.env` se busca en el directorio de ejecución; npm workspace usa la carpeta del simulador. Las variables ya definidas en el entorno tienen prioridad. Ctrl+C/SIGTERM aborta la petición en curso y detiene todos los envíos.

## Variables

| Variable | Uso / valor predeterminado |
| --- | --- |
| API_BASE_URL | http://localhost:3001/api/v1; usar HTTPS fuera del entorno local/LAN documentado |
| DEVICE_ID | Obligatoria; identidad registrada de la placa simulada |
| DEVICE_CREDENTIAL_ID | Obligatoria; ID de credencial, sin puntos/espacios |
| DEVICE_SECRET | Obligatoria; solo cabecera Bearer, nunca logs |
| SIMULATOR_MODE | normal, no_contact, unavailable, invalid o random_disconnect; normal por defecto |
| SIMULATOR_SEED | 42; números y cortes posteriores reproducibles para la misma ejecución |
| REQUEST_TIMEOUT_MS | 5000; límite de cada petición |
| CONFIG_INTERVAL_MS | 2000; refresco de sesión incluso si no hay sesión activa |
| RECONNECT_INTERVAL_MS | 2000; espera mínima entre reconexiones |
| DISCONNECT_EVERY_MS | 60000; primer corte; siguientes intervalos entre 0.5 y 1.5 veces este valor |
| DISCONNECT_DURATION_MS | 50000; supera el umbral de desconexión de 45 s |

No versionar `.env`, tokens, cuentas de servicio ni contraseñas. `.env.example` solo contiene marcadores. El cliente rechaza URL con usuario/contraseña/query/fragmento y no sigue redirecciones que podrían trasladar credenciales.

## Operación y escenarios

1. GET `/device/config`: comprueba identidad y obtiene activeSessionId e intervalos. Sin sesión, únicamente config/heartbeat.
2. POST `/device/heartbeat`: deviceId, bootId UUID por arranque, uptimeMs y firmwareVersion. Cadencia del servidor, normalmente 15 s.
3. POST `/device/measurements`: una muestra por petición, normalmente cada 2 s; sequence desde 1, capturedAt:null. Nunca envía patientId, assignmentId ni source.
4. Si una operación tarda, no hay ráfaga para recuperar intervalos perdidos. Las tres peticiones se serializan.

```powershell
$env:SIMULATOR_MODE='no_contact'
npm run dev --workspace=tools/device-simulator
# Detener con Ctrl+C antes de elegir otro modo.
```

- `normal`: pulso 60–100 bpm, SpO2 estimada 95–100 %, temperatura superficial 25–35 C.
- `no_contact`: ópticos null/no_contact; temperatura sigue válida e independiente.
- `unavailable` / `invalid`: las tres magnitudes null con su estado correspondiente.
- `random_disconnect`: suspende toda comunicación durante el corte. Descarta las muestras; al regresar consulta config y envía una nueva, sin cola ni reenvío histórico.

Un fallo real de red, timeout o 5xx también descarta la petición de medición y fuerza nueva config tras la espera. No se reintenta la muestra anterior: el contrato permite, pero no obliga, un reintento inmediato. Así nunca se confunde un corte con una cola de reenvío. Si el servidor guardó una petición cuya respuesta se perdió, la muestra siguiente usa otra secuencia. La deduplicación se verifica expresamente mediante la colección QA.

201 exige duplicate:false; 200 exige duplicate:true con referencia y fecha. 409 SESSION_NOT_ACTIVE/ASSIGNMENT_NOT_ACTIVE suspende mediciones y vuelve a config. 429 respeta Retry-After en segundos para todo el tráfico. 400/401/403, otros 409 y respuestas incompatibles detienen el proceso con salida 1. DEVICE_ID_MISMATCH se registra sin secretos. No se inventa validez clínica ni se transforma null en cero.

## Pruebas y QA

```powershell
npm test --workspace=tools/device-simulator
npm run typecheck --workspace=tools/device-simulator
npm run build --workspace=tools/device-simulator
```

[Procedimiento y matriz HTTP #32](../../docs/qa/pl2-08-hugo.md): `npm run qa --workspace=tools/device-simulator` verifica credenciales, identidad, calidades, duplicados, conflictos, concurrencia, permisos e historia; exige QA_ALLOW_WRITES=true y un fixture desechable. JOINT-CONC-08 usa un límite de 30000 ms solo para esa carrera; los demás casos usan `REQUEST_TIMEOUT_MS` (5000 ms por defecto). El reporte identifica ambos valores. El fixture se prepara con un script del backend protegido para emuladores; el cliente QA nunca accede a Firebase directamente.

[Resultados y límites](../../docs/evidencias/hugo-pl2-2026-10-20.md). Pasar pruebas aisladas del emisor no acredita la API objetivo, la nube ni el hardware. La demostración local oficial ya se ejecutó sobre abc4d45; nube y hardware conservan su aceptación independiente.

[Ampliación de QA](../../docs/evidencias/hugo-pl2-ampliacion-2026-10-20.md): 26 pruebas, timeout HTTP real, errores 500/503 y cambio de identidad. La colección incluye los ciclos conjuntos de reasignación y finalización concurrente; definir `QA_JOINT_DEVICE_SECRET` del fixture dedicado para habilitarlos. Comprueban las dependencias por HTTP y nunca presentan un endpoint faltante como aprobado.

[Matriz de Axel: permisos, consistencia y concurrencia](../../docs/qa/pl2-08-matriz-api-permisos.md): `src/qa-permissions.ts` añade a `npm run qa` los casos AUTH, ROL, CON y CONC. Usa las mismas credenciales `QA_ADMIN_EMAIL`, `QA_VIEWER_EMAIL` y `QA_PASSWORD`, y crea por API sus propios pacientes, placas y usuarios con códigos `QA-AX-*`, sin tocar el fixture presembrado. Al terminar libera las reservas y deshabilita lo creado. Se desactiva con `QA_PERMISSIONS=false`. Una ejecución completa hace unos 10 logins: para repetirla en local, arrancar la API con `LOGIN_RATE_LIMIT_MAX` mayor o esperar a que venza la ventana de 15 minutos. [Resultados](../../docs/evidencias/pl2-08-axel-2026-10-21.md).
