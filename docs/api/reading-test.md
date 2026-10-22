# Prueba temporal de lectura JSON por Wi-Fi

`POST /api/v1/dev/reading-test` confirma que Express recibe e interpreta una lectura de prueba. Está disponible únicamente en `NODE_ENV=development`; en `production` y `test` no se monta y una petición con JSON válido recibe `404 NOT_FOUND`.

**Esta ruta temporal no es el endpoint final de ingestión.** Exige la estructura de `MeasurementInput` del [OpenAPI aprobado](../../contracts/device.openapi.yaml), pero no autentica la placa, no verifica si existen `deviceId` o `sessionId`, no asocia pacientes/asignaciones, no llama a Firebase y no guarda datos. Los IDs son datos de prueba declarados por quien envía; no demuestran identidad. La ruta oficial `/api/v1/device/measurements` conserva su autenticación y comportamiento.

La NodeMCU ya recibió HTTP 200 repetidamente de `/api/v1/health` por LAN, según la prueba reportada por coordinación. Eso acredita esa comunicación previa. Esta rama incorpora el [sketch principal v1.2 y sus ejemplos](../../firmware/nodemcu/README.md); la incorporación no acredita una nueva compilación ni una nueva prueba física de este POST.

## Arrancar y probar desde PowerShell

Desde la raíz del repositorio, con las dependencias ya instaladas:

```powershell
$env:NODE_ENV = 'development'
npm run dev:api
```

Dejar esa terminal abierta para ver un objeto JSON por línea al recibir cada POST válido. Usar una segunda terminal para el POST. HTTP se usa exclusivamente para esta prueba en la red local; el despliegue final requiere HTTPS con verificación del servidor.

La NodeMCU debe usar la **IP local de la computadora**, no `localhost`: desde la placa, `localhost` apuntaría a la propia NodeMCU. Usar la misma IP y puerto con los que ya funcionó `/api/v1/health`. En Windows, `ipconfig` permite consultar la dirección IPv4 del adaptador conectado al router. Computadora y placa deben poder comunicarse en la LAN, sin aislamiento de clientes, y el firewall debe permitir el puerto de la API en la red privada.

En este ejemplo `192.168.1.50` es una IP ficticia: sustituirla por la del equipo. El puerto predeterminado es `3001`; si el servidor usa otro, cambiarlo también.

```powershell
$apiComputerIp = '192.168.1.50'
$readingTestUrl = "http://${apiComputerIp}:3001/api/v1/dev/reading-test"

# Valores expresamente ficticios; no son lecturas físicas ni datos clínicos.
$testReadingJson = @'
{
  "deviceId": "pulsolink-prueba",
  "sessionId": "sesion-prueba",
  "bootId": "550e8400-e29b-41d4-a716-446655440000",
  "sequence": 1,
  "capturedAt": null,
  "measurements": {
    "heartRate": {"value": 78, "unit": "bpm", "status": "valid"},
    "spo2": {"value": 96, "unit": "%", "status": "valid"},
    "skinTemperature": {"value": 27.1, "unit": "C", "status": "valid"}
  }
}
'@

Invoke-RestMethod -Method Post -Uri $readingTestUrl `
  -ContentType 'application/json' -Body $testReadingJson |
  ConvertTo-Json -Depth 6
```

No enviar Authorization, contraseñas, cookies ni tokens: no hacen falta. No se imprimen cabeceras ni el cuerpo sin validar. Solo se registra `JSON.stringify` del objeto validado, sin prefijo ni indentación, con un objeto por línea. El ejemplo usa valores expresamente ficticios; una prueba física posterior podrá enviar resultados nuevos de los sensores con esta misma estructura y sus estados de calidad, sin datos personales.

## JSON aceptado

La fuente de verdad es `components.schemas.MeasurementInput` del OpenAPI, no el validador anterior de ingestión oficial. Los seis campos superiores (`deviceId`, `sessionId`, `bootId`, `sequence`, `capturedAt`, `measurements`) y las tres magnitudes son obligatorios. Los objetos son estrictos: se rechazan campos adicionales, incluidos datos de autenticación o de pacientes.

`deviceId` y `sessionId` son cadenas opacas de 1 a 128 caracteres sin `/`, tal como indica el patrón `^[^/]+$` del OpenAPI; no hay consulta de existencia. `bootId` debe ser un UUID: v1.2 genera uno por arranque. `sequence` debe ser un entero entre `0` y `4294967295`; el sketch lo incrementa para cada intento de envío nuevo.

`capturedAt` debe ser una fecha ISO 8601 UTC terminada en `Z` (ejemplo: `2026-10-18T18:00:00.000Z`) o `null` si la placa no tiene reloj sincronizado. La API genera su propia hora `receivedAt`.

| Magnitud | Unidad exacta | Límites técnicos para `valid` |
| --- | --- | --- |
| `heartRate` | `bpm` | Número finito mayor que 0 y hasta 300 |
| `spo2` | `%` | Número finito entre 0 y 100 |
| `skinTemperature` | `C` | Número finito entre −55 y 125 |

Cada objeto exige `value`, `unit` y `status`. Estados admitidos: `valid`, `no_contact`, `invalid`, `unavailable`. Si el estado no es `valid`, `value` debe ser `null`. Cada magnitud tiene calidad independiente; por ejemplo, sin contacto óptico se puede enviar `heartRate` y `spo2` con `null/no_contact` y conservar temperatura válida. `stale` no es un estado enviado por el sensor.

Los límites son técnicos, no rangos médicos. La temperatura es superficial; la SpO₂ es una estimación académica. El ejemplo no acredita adquisición de sensores ni validez clínica.

## Respuesta exacta para la NodeMCU

Con un JSON aceptado, HTTP **200**, `Content-Type: application/json`:

```json
{
  "data": {
    "received": true,
    "deviceId": "pulsolink-prueba",
    "receivedAt": "2026-10-18T18:00:00.000Z",
    "persisted": false
  }
}
```

`receivedAt` cambia por la hora UTC del servidor en cada petición; `deviceId` refleja el valor validado del cuerpo. `received:true` confirma únicamente recepción y validación; `persisted:false` confirma que no se guardó. No hay deduplicación, consulta histórica ni asociación clínica en esta ruta.

Para el ejemplo ficticio, la línea emitida por el manejador será exactamente este JSON validado. No incorpora `receivedAt`, etiquetas ni el resto de la petición HTTP:

```json
{"deviceId":"pulsolink-prueba","sessionId":"sesion-prueba","bootId":"550e8400-e29b-41d4-a716-446655440000","sequence":1,"capturedAt":null,"measurements":{"heartRate":{"value":78,"unit":"bpm","status":"valid"},"spo2":{"value":96,"unit":"%","status":"valid"},"skinTemperature":{"value":27.1,"unit":"C","status":"valid"}}}
```

La línea se puede interpretar con `JSON.parse`; coincide en contenido con el mensaje aceptado. Los saltos de línea dentro de cadenas se escapan con `JSON.stringify`, por lo que no fragmentan el registro. Un POST inválido no imprime una lectura.

Un JSON bien formado que incumple el esquema devuelve HTTP **400**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos proporcionados no son válidos.",
    "requestId": "req-<valor variable>",
    "details": [
      {
        "path": "measurements.spo2.value",
        "message": "value debe ser null cuando status no es valid."
      }
    ]
  }
}
```

Ese ejemplo corresponde a `spo2.status:"invalid"` con un valor numérico. Las rutas/mensajes de `details` dependen del error. Si el texto no se puede interpretar como JSON, el mismo código devuelve el mensaje `El cuerpo de la petición no es JSON válido.` sin `details`. El límite existente de 8 KiB se mantiene: excederlo devuelve **413**.

## Verificación automatizada

Desde la raíz en PowerShell:

```powershell
npm run test --workspace=apps/api -- test/reading-test.test.ts test/auth/app-protection.test.ts test/device-api.test.ts
npm run typecheck
```

Resultado ejecutado tras integrar `main` hasta `2101297` el 21 de octubre de 2026: **91 pruebas aprobadas** (59 de la ruta temporal, 9 de protección de la aplicación y 23 de ingestión oficial); `npm run typecheck` aprobado para API, web y simulador. Se ejecutó con Node.js `v22.13.1`, disponible en este equipo; el objetivo del proyecto sigue siendo Node.js 24 LTS. La primera ejecución de pruebas encontró restricciones de red local del sandbox (`EACCES`); la ejecución con permiso para HTTP local aprobó las 91 pruebas.

La suite usa la aplicación Express real y dobles de las entradas de Firebase que fallan si se invocan. Comprueba el mensaje completo del OpenAPI, consola interpretable como JSON e igual al objeto validado, calidad/nulos, unidades/rangos, UUID, secuencia uint32, tipos/campos requeridos, JSON malformado, ausencia en producción/test, límite de cuerpo y omisión de secretos en logs. Verifica que no se accede a Firestore ni Auth al atender esas peticiones y que el endpoint oficial sigue exigiendo credencial. No requiere emuladores.

Estas pruebas no demuestran persistencia en Firestore, despliegue ni recepción física del POST por Wi-Fi. La aceptación física pendiente es: NodeMCU envía este JSON → terminal muestra el objeto validado en una línea → placa recibe HTTP 200 y `received:true`, `persisted:false`.

## Cadencia y pérdida de conexión

La cadencia objetivo es un **resultado nuevo aproximadamente cada 2 segundos**. La API procesa cada POST cuando llega; no contiene temporizador, cola, acumulación ni generación de muestras. Esa frecuencia de envío es independiente del muestreo físico de los sensores. V1.2 espera al menos 2000 ms después de terminar un intento; la adquisición y la red pueden alargar ese intervalo. Si no hay Wi-Fi, omite el envío y no acumula una cola de intervalos para reproducirlos al reconectar. Ver los detalles del [firmware incorporado](../../firmware/nodemcu/README.md).

## Diferencias con la ingestión oficial actual

Comparación con la implementación integrada desde `main` (`2101297`). El OpenAPI sigue siendo la fuente de verdad; **el sketch requiere adaptación antes de utilizar la ruta oficial**:

- El endpoint oficial ya exige `deviceId` y lo contrasta con la identidad autenticada. Esta ruta temporal solo valida su formato.
- Ambos endpoints HTTP exigen `capturedAt`. El oficial acepta fechas con desplazamiento horario y las normaliza a UTC; esta prueba exige fecha UTC terminada en `Z` o `null`, conforme al contrato aprobado.
- Los IDs del contrato son cadenas sin `/`; el validador oficial además rechaza `.` y `..`. La prueba temporal sigue el patrón aprobado, sin consulta de existencia.
- El oficial valida dispositivo y sesión activa, persiste y aplica idempotencia. Para las sesiones del modelo de pacientes también comprueba la asignación, el paciente habilitado y la coherencia de sus relaciones, y fija los IDs históricos. Conserva compatibilidad interna con sesiones de legado; este diagnóstico temporal no consulta ninguna relación.
- El oficial responde `201` al insertar o `200` al deduplicar, con `measurementId`, `receivedAt` y `duplicate`. Esta prueba solo confirma recepción con `200` y `persisted:false`, incluso si se repite exactamente un POST.

El cambio de la API agrega únicamente el diagnóstico temporal; no modifica ingestión oficial, Firestore, asignaciones ni CRUD. Los sketches se incorporan por separado como firmware de pruebas, sin implementar aún su autenticación e integración oficial.
