# PulsoAI: aceptación final de #72

La comprobación tiene dos entornos: Auth/Firestore Standard emulados con una
llamada real a Groq, y el servicio HTTPS de Render con Firebase cloud. Un PASS
local no sustituye el recorrido desplegado. Solo se usan pacientes ficticios y
dispositivos `simulated`.

## Suite local completa

Requisitos: Node.js 24, Java 21, dependencias del lockfile, Microsoft Edge y la
clave privada existente en `apps/api/.env`. Playwright puede estar en una
instalación local independiente; no se agrega a las dependencias de producto.

Desde la raíz, en PowerShell con Node 24 activo:

```powershell
npm run typecheck
npm run build
npm run lint
npm install --prefix .cache/pulsoai-tools --no-audit --no-fund playwright
$env:PULSOLINK_PLAYWRIGHT_MODULE = (Resolve-Path '.cache/pulsoai-tools/node_modules/playwright').Path
$env:FIREBASE_PROJECT_ID = 'demo-pulsoai-final'
$env:PULSOAI_QA_ALLOW_REAL_GROQ = 'true'
npx firebase-tools@15.34.0 emulators:exec --config firebase/emulators.test.json --project demo-pulsoai-final --only firestore,auth 'node tools/qa/pulsoai-final-suite.cjs'
```

Usar emuladores desechables y puertos libres. Si ya hay otro entorno en uso,
crear una configuración ignorada dentro de `.cache/`, con copias de las reglas
e índices y puertos diferentes; no detener procesos de otros trabajos.

`pulsoai-final-suite.cjs` ejecuta la API y web desde sus directorios respectivos,
los tests del simulador y el recorrido de navegador. Los archivos se ejecutan
en serie para evitar interferencia de fixtures y presión de memoria. El
navegador corre primero con el proyecto `demo-` predeterminado del emulador
Auth, antes de que los tests API creen otros trabajos pendientes. Las dos pruebas web HTTP opt-in se ejecutan
con cookie real del emulador y más de cien mediciones: no se aceptan como
omitidas en el resultado final.

El script conserva resultados JSON en `.cache/pulsoai-final/`. El recorrido
de navegador produce capturas, estadísticas, consumo real de Groq y seis
carreras HTTP con presupuesto de 5000 ms en `.cache/pulsoai-browser/`.
El script `lint` actual del repositorio solo imprime un mensaje; no constituye
un análisis estático adicional.

## Matriz de fallos sin llamadas externas

`apps/api/test/pulsoai-failures.test.ts` cubre:

| Caso | Resultado exigido |
| --- | --- |
| 400, 401, 403, 404/modelo inexistente | Fallo permanente saneado, sin reintento automático |
| 429, 500, 502, 503 | Fallo transitorio, sin reintentos ocultos en el adaptador |
| Retry-After segundos/fecha/inválido/extremo | Espera respetada y acotada; no reclamar antes del plazo |
| Timeout antes de cabeceras o durante el cuerpo; conexión interrumpida | `PROVIDER_UNAVAILABLE` transitorio |
| JSON exterior/interior inválido, incompleto, duplicado, hecho o variante inventados | `INVALID_GENERATION`, sin publicar la respuesta |
| Texto con cifras/diagnóstico añadido, modelo distinto o truncamiento | Rechazo; solo publicar los hechos aprobados del servidor |
| Tercer fallo transitorio o fallo permanente | `failed`, estadísticas conservadas, texto null, sin cuarto intento |
| Sesión vacía, no_contact, invalid, unavailable | Sin llamada a IA; estadísticas null sin cero ficticio |
| Ópticos sin contacto y temperatura válida | Conservar temperatura y origen simulado |

`pulsoai-emulator.test.ts` comprueba reclamo único, recuperación con una nueva
instancia de worker después de expirar el lease, rechazo del publicador antiguo,
presupuesto agotado tras tres reclamos interrumpidos y cierre/ingestión atómicos.
La expiración se adelanta explícitamente en el fixture; no se afirma haber
reiniciado Render por esta prueba. Los fallos del proveedor se inyectan; no se
fuerzan errores ni cuota en la cuenta real de Groq.

La última etapa de la suite, `pulsoai-restart-acceptance.cjs`, termina un proceso
Node real después de entrar al proveedor inyectado, espera los cinco minutos
reales del lease y recupera el trabajo en otro proceso. Verifica `ready`, dos
reclamos, historia conservada y rechazo del lease anterior. Usa un proyecto
`demo-` aislado, no llama a Groq y no reinicia el servicio Render. Su informe
se guarda en `.cache/pulsoai-restart/results.json`.

Las pruebas React verifican mensajes, estadísticas disponibles ante fallo,
valores nulos, contacto independiente por magnitud, texto seguro y controles
de reintento por rol. Los permisos HTTP de cookies, CSRF y admin/viewer también
forman parte de la suite API.

## Configuración y aceptación en Render

Servicio existente: `pulsolink-api`, repositorio `codsebas/PulsoLink`, rama
`main`, un proceso API y web del mismo origen. Consultar [configuración](../setup/render.md).

Variables exclusivamente del backend:

| Variable | Valor |
| --- | --- |
| `SESSION_SUMMARY_ENABLED` | `true` |
| `GROQ_MODEL` | `openai/gpt-oss-20b` |
| `GROQ_API_KEY` | Clave privada autorizada de Groq |

Guardar y desplegar las variables. `Save only` no cambia el proceso en curso.
No usar `VITE_*` para la clave ni modificar el plan de facturación.

Para ejecutar el verificador HTTPS, retirar variables de emuladores en esta
terminal y conservar la configuración cloud privada autorizada:

```powershell
Remove-Item Env:FIRESTORE_EMULATOR_HOST -ErrorAction SilentlyContinue
Remove-Item Env:FIREBASE_AUTH_EMULATOR_HOST -ErrorAction SilentlyContinue
Remove-Item Env:FIREBASE_PROJECT_ID -ErrorAction SilentlyContinue
$env:PULSOAI_RENDER_ALLOW_WRITES = 'true'
$env:PULSOLINK_PLAYWRIGHT_MODULE = (Resolve-Path '.cache/pulsoai-tools/node_modules/playwright').Path
node tools/qa/pulsoai-render-acceptance.cjs
```

El verificador restringe el destino a `https://pulsolink-api.onrender.com` y al
proyecto `pulsolink-pruebas-2026-7c8a31`. Obtiene la cuenta admin de
`%LOCALAPPDATA%/PulsoLink/<projectId>/cuenta-admin-render.json`, fuera del
repositorio; se puede seleccionar otro archivo privado mediante
`PULSOAI_RENDER_ACCOUNTS_FILE`. No imprime contraseñas, cookies ni credenciales.

Comprueba TLS sin desactivar certificados, cookie Secure/HttpOnly/SameSite,
login, ausencia de trabajo en sesión activa, ingestión oficial y tres sesiones:
vacía, sin valores válidos y mixta. Las dos primeras exigen `insufficient_data`;
la tercera exige `ready`, estadísticas exactas, texto conforme a todos los
hechos aprobados, proveedor/modelo correctos y persistencia independiente en
Firestore. Verifica CSRF, autenticación, idempotencia de cierre/reintento,
recarga y presentación de escritorio/móvil.

Un resultado `disabled`, `failed` o un timeout hace fallar la aceptación. Los
informes y capturas quedan en `.cache/pulsoai-render/`. Al finalizar se cierran
las sesiones/asignación propias, se revoca la credencial temporal y se
deshabilitan paciente/dispositivo ficticios. Se conserva el historial. Nunca
se modifican fixtures anteriores ni se borran registros para aprobar.

## Cierre

Cerrar #72 únicamente cuando la corrección esté integrada y desplegada,
la suite local completa pase y la ejecución HTTPS termine PASS. Registrar
commit, deploy, resultados y límites en `docs/evidencias/` y en el issue.

Referencias oficiales consultadas el 23 de octubre de 2026:
[errores de Groq](https://console.groq.com/docs/errors),
[límites y Retry-After](https://console.groq.com/docs/rate-limits),
[variables de Render](https://render.com/docs/configure-environment-variables).
