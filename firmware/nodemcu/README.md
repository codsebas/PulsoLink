# Firmware NodeMCU ESP8266

Responsable: `@codsebas`, [issue #12](https://github.com/codsebas/PulsoLink/issues/12). Hardware: NodeMCU ESP8266, MAX30102 por I2C y DS18B20 TO-92 por 1-Wire; ver [hardware](../../docs/hardware/README.md).

**Estado al 21 de octubre de 2026:** incorporados siete sketches procedentes de las pruebas locales de `@codsebas`. El ensamblaje físico está terminado según lo informado por el responsable. La versión principal es **PulsaLink v1.2**, que integra MAX30102, DS18B20 y envío HTTP por Wi-Fi. Esta incorporación conserva la lógica de los originales; únicamente extrae la configuración privada de v1.2. Los seis ejemplos conservan su contenido original. La copia al repositorio no acredita una nueva compilación, carga en placa ni prueba física.

## Sketch principal y ejemplos

Abrir en Arduino IDE el archivo `.ino` de la versión elegida. Cada sketch permanece en una carpeta con su mismo nombre; los ejemplos se cargan individualmente y sustituyen el programa que tenga la placa.

| Ubicación | Propósito |
| --- | --- |
| [src/sketch-pulsa-link-v1.2/sketch-pulsa-link-v1.2.ino](src/sketch-pulsa-link-v1.2/sketch-pulsa-link-v1.2.ino) | **Principal:** sensores integrados y POST de lecturas a la API temporal. |
| [examples/sketch-pulsa-link-v1.1/sketch-pulsa-link-v1.1.ino](examples/sketch-pulsa-link-v1.1/sketch-pulsa-link-v1.1.ino) | Sensores integrados con salida serial, sin envío HTTP. |
| [examples/sketch-pulsa-link-v1.0/sketch-pulsa-link-v1.0.ino](examples/sketch-pulsa-link-v1.0/sketch-pulsa-link-v1.0.ino) | Diagnóstico I2C y lectura de identificación del MAX30102. |
| [examples/sketch-temperatura-v1.0/sketch-temperatura-v1.0.ino](examples/sketch-temperatura-v1.0/sketch-temperatura-v1.0.ino) | Lectura independiente del DS18B20. |
| [examples/sktech-oximetro-v1.0/sktech-oximetro-v1.0.ino](examples/sktech-oximetro-v1.0/sktech-oximetro-v1.0.ino) | Señal infrarroja del MAX30102 para comprobar contacto. |
| [examples/sktech-oximetro-v1.1/sktech-oximetro-v1.1.ino](examples/sktech-oximetro-v1.1/sktech-oximetro-v1.1.ino) | Estimación de pulso y SpO₂ con detección de señal débil o saturación. |
| [examples/sketch-pruebas/sketch-pruebas.ino](examples/sketch-pruebas/sketch-pruebas.ino) | Variante de diagnóstico óptico que informa errores I2C cuando no llegan muestras. |

Se conservan los nombres originales, incluido `sktech` en los ejemplos de oxímetro, para mantener la correspondencia con las pruebas previas.

## Preparar v1.2 en Arduino IDE

1. Tener instalado el soporte de placas **ESP8266** y seleccionar **NodeMCU 1.0 (ESP-12E Module)** y el puerto de la placa.
2. Instalar las bibliotecas **OneWire**, **DallasTemperature** y **SparkFun MAX3010x Pulse and Proximity Sensor Library**. Esta última aporta `MAX30105.h` y `spo2_algorithm.h`, utilizados para el MAX30102. `Wire`, `ESP8266WiFi` y `ESP8266HTTPClient` pertenecen al soporte ESP8266. No se han fijado versiones verificadas de estas dependencias en esta incorporación.
3. Desde la raíz del repositorio, crear la configuración local una sola vez con PowerShell:

   ```powershell
   $sketchDir = '.\firmware\nodemcu\src\sketch-pulsa-link-v1.2'
   if (-not (Test-Path -LiteralPath "$sketchDir\config.local.h")) {
       Copy-Item -LiteralPath "$sketchDir\config.example.h" -Destination "$sketchDir\config.local.h"
   }
   ```

4. Editar **solo `config.local.h`**: indicar SSID, contraseña y URL de la API. Este archivo está excluido de Git; la plantilla contiene únicamente valores ficticios. No agregarlo mediante `git add -f` ni pegar credenciales en evidencias. Antes de este paso, la compilación fallará por falta del encabezado local.
5. Usar en `kApiUrl` la **IP local de la computadora**, con puerto `3001` y ruta `/api/v1/dev/reading-test`. `localhost` desde la NodeMCU apunta a la propia placa. La computadora debe ser accesible en la red local y permitir el puerto de la API.
6. Abrir el sketch principal, verificar/compilar, cargarlo en la NodeMCU y abrir el monitor serial a **115200 baudios**. Registrar las versiones de IDE, core y bibliotecas al documentar una nueva prueba física.

Conexiones utilizadas por los sketches:

| Sensor | Señal en NodeMCU |
| --- | --- |
| MAX30102 | SDA = D2 (GPIO4), SCL = D1 (GPIO5). |
| DS18B20 | Datos = D5 (GPIO14), resistencia de 4.7 kΩ entre datos y 3.3 V. |

Consultar también la [documentación de hardware](../../docs/hardware/README.md) para el montaje.

## Alcance real de la versión principal

V1.2 usa **HTTP en LAN** y la [ruta temporal de desarrollo](../../docs/api/reading-test.md), disponible únicamente con `NODE_ENV=development`. Envía `deviceId`, `sessionId`, `bootId`, `sequence`, `capturedAt` y `measurements` con `heartRate`, `spo2` y `skinTemperature`. Los IDs son de prueba, `bootId` se genera al arrancar y `capturedAt` es `null`; los valores proceden de los sensores y se envían como `null` cuando su estado no es `valid`.

El intervalo configurado de envío es 2000 ms, independiente de la adquisición óptica y la conversión de temperatura. El código espera al menos ese intervalo después de finalizar un intento; la adquisición y la red pueden alargar la cadencia efectiva. Si no hay Wi-Fi se omite el envío; no existe una cola para acumular intervalos ni reproducirlos después.

Una respuesta exitosa de la ruta temporal tiene esta forma (hora e identificador mostrados como ejemplo):

```json
{
  "data": {
    "received": true,
    "deviceId": "pulsolink-prueba",
    "receivedAt": "2026-10-21T21:00:00.000Z",
    "persisted": false
  }
}
```

Esta confirmación verifica recepción y validación del mensaje. **No prueba persistencia en Firestore ni asociación con pacientes.** V1.2 todavía no implementa credenciales de dispositivo, consulta de configuración, heartbeat, sesión real ni HTTPS con verificación de certificado. No basta cambiar la URL por `/api/v1/device/measurements` para completar esa integración. Es el sketch principal de la prueba física actual; la adaptación al contrato oficial sigue pendiente.

La temperatura es superficial y la SpO₂ una estimación académica sujeta a calibración y contacto. Estos ejemplos no acreditan uso clínico.

## Contrato objetivo, pendiente de implementación

Seguir [Contrato A 2.0.0](../../contracts/device.openapi.yaml) y [arquitectura aprobada](../../docs/arquitectura/contrato-aprobado-2026-10-18.md):

1. Registrar y habilitar la placa; recibir su `deviceId` y credencial por canal privado. Ni MAC ni `hardwareId` son credenciales. Nunca versionar ni imprimir el secreto.
2. Consultar `/api/v1/device/config`; sin sesión activa solo consultar configuración y enviar heartbeat. El firmware no conoce `patientId` ni elige paciente o asignación.
3. Incluir `deviceId` en los cuerpos de heartbeat y mediciones; el backend lo contrasta con la identidad autenticada. En mediciones enviar `sessionId`, `bootId` UUID, `sequence`, `capturedAt` UTC o `null` y las tres magnitudes. El secreto va exclusivamente en `Authorization`.
4. Reportar muestras nuevas aproximadamente cada 2000 ms según configuración. El muestreo óptico físico tiene su propia frecuencia. Valores no válidos se envían como `null` con estado, nunca cero inventado.
5. Durante pérdida de Wi-Fi descartar muestras locales; no crear cola en RAM ni persistente para reproducir el corte. Solo reintentar de forma inmediata y limitada la petición en curso con igual contenido. Tras reconectar enviar datos nuevos; no reconstruir el tramo perdido.
6. En producción usar HTTPS y verificar cadena/certificado del servidor; no usar `setInsecure`. Para pruebas LAN usar dirección alcanzable del equipo (no `localhost` desde la placa), puerto/firewall y una red de desarrollo controlada. Documentar expresamente si la prueba local usa HTTP; esa excepción no pasa a despliegue.

El personal configura Wi-Fi localmente. Aplicación móvil y sustitución por ESP32/Raspberry Pi quedan fuera del alcance aprobado. Conservar la distinción entre temperatura superficial y central, SpO₂ académica y diagnóstico. La aceptación física exige sketch/entorno versionados sin secretos y evidencia real dispositivo → API → web según [plan](../../docs/planificacion/ejecucion-2026-10-18.md).
