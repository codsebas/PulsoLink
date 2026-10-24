# Node MSU 01 — preparación y aceptación HTTPS (#35)

Fecha: 23-10-2026. Responsable: `@codsebas`. Rama: `feat/nodemcu-render`.

## Decisiones confirmadas

- Código visible **Node MSU 01**, ID interno `node-msu-01`, origen `real`.
- NodeMCU ESP8266; MAX30102 SDA=D2/GPIO4, SCL=D1/GPIO5; DS18B20 D5/GPIO14.
- Un único archivo `.ino` con configuración integrada. Copia privada fuera de
  Git y OneDrive; la plantilla pública contiene placeholders.
- Se conservan inicialización, algoritmo de SpO₂/pulso, umbrales, ventanas y
  conversión de temperatura del sketch que el usuario declara cargado/probado.
- HTTPS hacia `https://pulsolink-api.onrender.com/api/v1`. No usar `setInsecure`.
- El backend decide sesión/paciente/asignación. Sin sesión activa no hay POST
  de mediciones. Credencial exclusiva del dispositivo, nunca credenciales Admin.

## Estado comprobado

| Verificación | Resultado |
| --- | --- |
| Aprovisionamiento cloud | Dry-run y aplicación ejecutados; dispositivo/credencial creados mediante script existente y auditoría |
| GET config HTTPS desde PC con credencial real | 200, ID correcto, sesión null, intervalos 2000/15000 ms |
| GET config con secreto incorrecto desde PC | 401 |
| Código C++ de política/configuración/confirmaciones | 43 casos aprobados mediante compilador nativo |
| Conservación de sensores | Siete funciones comparadas con v1.2, pines y parámetros iguales |
| Compilación pública y copia privada | Aprobadas con ESP8266 3.1.2, NodeMCU 1.0 ESP-12E, 160 MHz |
| Ejecución física con v1.3 | Salida serie aportada por el usuario: config 401 y eventos de desconexión Wi-Fi; sin aceptación completa |

No se enviaron lecturas sintéticas como `real` desde PC. La consulta de config
no simula el recorrido del hardware. No cerrar #35 sin completar la prueba física.

Evidencias ejecutadas: [43 casos C++](../evidencias/nodemcu-2026-10-23/policy.json)
y [consulta HTTPS desde PC](../evidencias/nodemcu-2026-10-23/https-config.json).

El usuario decidió realizar la carga manual desde Arduino IDE. El agente no
modificó la memoria flash. Posteriormente el usuario aportó salida del firmware
v1.3 con config HTTP 401 y eventos de desconexión Wi-Fi, sin sensores conectados.
La credencial de la copia privada volvió a comprobarse desde PC: config 200.
Windows detectó y permitió abrir COM7 con CH340 3.7.2022.1 en una comprobación,
pero luego dejó de detectarlo. El usuario informó calentamiento y deformación
del cable anterior; no se diagnosticó la causa física ni se certificó el hardware.

Consulta cloud del 23-10-2026 a las 18:54 de Guatemala: `node-msu-01` habilitado,
`lastSeenAt:null`, `activeSessionId:null`. No hay heartbeat o medición aceptada
registrados para esta placa. La carga final y aceptación física siguen pendientes.

## Archivo que se carga

Ubicación privada en Windows:

`%LOCALAPPDATA%/PulsoLink/pulsolink-pruebas-2026-7c8a31/Node-MSU-01/pulsolink-v1.3/pulsolink-v1.3.ino`

La misma carpeta de `Node-MSU-01` conserva `original-v1.2/original-v1.2.ino`
como respaldo del adjunto, con sus valores originales. No imprimir ni versionar
ninguno de esos archivos privados. La credencial se conserva en
`physical-node-msu-01.json` dentro de la carpeta privada del proyecto.

Para la demostración, editar solo `kWifiSsid` y `kWifiPassword` al principio de
la copia privada. Mantener `kDeviceId`, `kDeviceCredential`, `kApiBase` y la CA.
Abrir el `.ino` de esa carpeta en Arduino IDE; no seleccionar la plantilla de Git
sin completar sus placeholders.

Si hace falta regenerar desde un sketch privado original con las constantes
`kWifiSsid` y `kWifiPassword`:

```powershell
node tools/qa/prepare-nodemcu-private.cjs 'C:\ruta-privada\original.ino'
```

El generador protege la carpeta local con ACL de usuario/SYSTEM y conserva la
copia anterior al regenerar. No imprime los valores. Regenerar toma el Wi-Fi
del original proporcionado; no hacerlo después de editar la red de demostración
salvo que se quiera reemplazar esa configuración.

## Entorno de compilación ejecutado

| Componente | Versión |
| --- | --- |
| ESP8266 Arduino core | 3.1.2 |
| SparkFun MAX3010x | 1.1.2 |
| DallasTemperature | 4.0.6 |
| OneWire | 2.3.8 |
| ArduinoJson | 6.21.5 |

```powershell
$cli = "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"
& $cli lib install 'ArduinoJson@6.21.5'
& $cli compile --fqbn 'esp8266:esp8266:nodemcuv2:xtal=160' --build-path .cache/nodemcu-build firmware/nodemcu/src/pulsolink-v1.3
$env:PATH = 'C:\msys64\mingw64\bin;' + $env:PATH
node tools/qa/nodemcu-policy-tests.cjs
```

La copia privada también compiló: RAM global 36536/80192 bytes (45%), IRAM
incluyendo caché 61279/65536 (93%), código flash 386044/1048576 (36%). Es un
reporte de compilación; no mide el heap durante una negociación TLS. La biblioteca
SparkFun emite una advertencia de redefinición de `I2C_BUFFER_LENGTH`, sin error
de compilación; no se modificaron las bibliotecas instaladas.

La CA GTS Root R4 se obtuvo de `https://pki.goog/roots.pem`; se verificaron su
autofirma y la cadena HTTPS de Render desde Node. SHA-256 de la raíz:
`34:9D:FA:40:58:C5:E2:63:12:3B:39:8A:E7:95:57:3C:4E:13:13:C8:3F:E6:8F:93:55:6C:D5:E8:03:1B:3C:7D`.
Si Render cambia de emisor, actualizar las raíces tras verificar la nueva cadena;
no desactivar validación ni fijar la huella de un certificado de servidor efímero.

## Comportamiento y límites

- Wi-Fi perdido o cambio de sesión: descartar la ventana óptica y la temperatura
  anterior; esperar muestras nuevas. No guardar payloads para reenvío.
- 401/403 y otros errores permanentes de solicitud: detener envío y avisar por
  serial; corregir la configuración y reiniciar. 409 de estado: descartar y
  volver a consultar config. Conflicto de idempotencia: detenerse.
- 429: esperar `Retry-After` en segundos, como define el contrato A. Red/5xx:
  espera acotada 5–40 s. No reenviar una petición cuya recepción sea incierta.
- `bootId` nuevo por arranque, secuencia creciente, `capturedAt:null`; el servidor
  asigna `receivedAt`. SNTP se usa para validar TLS, sin atribuir una hora
  instantánea a una ventana óptica de varios segundos.
- Se respeta el intervalo de API como espera mínima. **No se garantiza una
  muestra cada dos segundos:** se conserva el reinicio de ventana después de HTTP
  del código original. Con 100 muestras y promedio de cuatro, reconstruirla
  requiere aproximadamente cuatro segundos, además de la petición. Medir la
  cadencia real durante la prueba física. No se cambian parámetros del algoritmo
  para simular una mayor frecuencia de lectura.
- Temperatura superficial y SpO₂ académica. Los estados no válidos llevan
  `value:null`; una magnitud no oculta la calidad de las otras.

## Prueba física pendiente

1. Conectar por USB; cerrar monitores serie. `arduino-cli board list` debe mostrar
   el puerto actual (no asumir COM8 si Windows asigna otro).
2. Cargar **la copia privada** con la placa NodeMCU 1.0 ESP-12E y CPU 160 MHz.
   Abrir serial a 115200. Confirmar sensores, Wi-Fi, config 200 y heartbeat 200.
3. Desde la web, crear un paciente ficticio, asignar Node MSU 01, crear/iniciar
   sesión. Confirmar que la placa obtiene la sesión y responde measurements 201.
4. Verificar en API/Firestore y web IDs históricos, origen real, null/contacto
   y magnitudes válidas realmente observadas. No inventar valores ni inferir
   contacto físico a partir de un éxito HTTP.
5. Retirar contacto óptico; comprobar null/no_contact y temperatura independiente.
   Cortar Wi-Fi y reconectar; comprobar hueco real sin relleno ni reenvío.
6. Finalizar sesión y comprobar que cesan mediciones; abrir una nueva sesión para
   comprobar que el firmware la descubre sin editar ni volver a cargar el sketch.
7. Cerrar únicamente los fixtures de prueba propios y conservar su historial.

El lector `tools/qa/nodemcu-serial.py COM8 60` registra solo prefijos conocidos
del firmware en `.cache/nodemcu-tests/`; no copia cuerpos HTTP arbitrarios.

Referencias: [BearSSL ESP8266](https://arduino-esp8266.readthedocs.io/en/latest/esp8266wifi/bearssl-client-secure-class.html),
[ejemplo de adquisición SparkFun](https://github.com/sparkfun/SparkFun_MAX3010x_Sensor_Library/blob/master/examples/Example8_SPO2/Example8_SPO2.ino),
[Contrato A](../../contracts/device.openapi.yaml).
