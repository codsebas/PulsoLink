# Base Firebase PL2 — Gerson / #25 y #34

Firestore **Standard**, Auth por correo/contraseña y Admin SDK solo en backend. Reutilizar `firebase.json`, las reglas de denegación total y `getDb/getAuth`. Ninguna herramienta de esta entrega crea bases, habilita facturación o despliega a producción.

## Emuladores y datos de prueba

Requisitos: Node.js 24 LTS, npm y Java 21. Desde la raíz PowerShell:

```powershell
npm ci
$env:FIREBASE_PROJECT_ID = 'demo-pulsolink'
npx -y firebase-tools@15.34.0 emulators:start --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth
```

En otra terminal, desde la misma raíz:

```powershell
$env:FIREBASE_PROJECT_ID = 'demo-pulsolink'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:18080'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:19099'
# Generar una vez por conjunto de datos y conservar por mecanismo local privado.
$env:DEMO_FIXTURE_PASSWORD = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
$env:DEMO_DEVICE_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).TrimEnd('=').Replace('+','-').Replace('/','_')
Push-Location 'apps/api'
npx tsx src/scripts/seed-emulators.ts
Pop-Location
```

El script solo acepta hosts locales y proyecto `demo-`; crea `demo-admin` y `demo-viewer` (correos `demo-admin@example.invalid` y `demo-viewer@example.invalid`), sus perfiles y `demo-device-1`/`demo-credential-1`. No imprime contraseñas, secretos ni tokens. Las identidades existentes conservan contraseña, nombre y habilitación. Los perfiles/documentos existentes no se sobrescriben. Volver a ejecutar en la misma terminal conserva los valores; no regenerar el secreto para una credencial existente.

También prepara dos pacientes seudónimos y 48 lecturas simuladas del paciente A: 24 con la placa 1 y 24 con la placa 2, separados por un hueco. El paciente B comienza sin lecturas.

Además prepara un tercer paciente seudónimo de monitoreo (`monitor-patient`) con dos placas y dos sesiones: 240 lecturas con tres lecturas por milisegundo (empate temporal), una desconexión de quince segundos entre placas y lecturas sin contacto óptico. Con el límite de página de 100 el historial exige tres páginas; sirve para probar la paginación del frontend (#31).

Cada conjunto se crea en una sola transacción con un marcador: repetir la semilla no cambia reservas ni fechas. Si los IDs de demostración ya tienen otros datos, se rechaza el conflicto. No usar esta semilla para cargar datos reales.

Auth y Firestore no comparten transacción. Si Auth se crea y falla Firestore, las identidades se conservan: corregir el conflicto y repetir con los mismos valores completa solo lo faltante. No borrar ni reactivar cuentas automáticamente. El anterior `provision-auth-users.ts` es legado: actualiza cuentas existentes y no debe usarse como sustituto de esta semilla repetible.

## Roles y compatibilidad

Se admiten perfiles `admin/viewer`. `viewer` es de consulta; los servicios existentes de sesiones rechazan sus mutaciones incluso al invocarse sin router. `operator` sigue reconocido durante la ventana de legado: **no se transforma en admin** ni se cambia el rol de perfiles existentes al aprovisionar. La migración explícita del legado y la revocación de sesiones deben aplicarse antes de desplegar la nueva arquitectura. Marielos mantiene la responsabilidad de Auth/usuarios/auditoría HTTP.

## Variables por entorno

| Variables | Local/prueba | Nube de prueba/despliegue |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | `demo-pulsolink`, explícito | ID real acordado; verificar Standard e IAM |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` | Ambas; sin protocolo | Ausentes |
| `GOOGLE_APPLICATION_CREDENTIALS` o ADC administrado | No requerido para emuladores | Solo servidor; fuera de Git |
| `DEMO_FIXTURE_PASSWORD`, `DEMO_DEVICE_SECRET` | Aleatorios, privados; solo semilla | La semilla de emuladores rechaza este entorno |
| `FIREBASE_WEB_API_KEY` | Valor técnico `emulator` para Auth REST | Configuración pública del proyecto, no credencial Admin |
| `CSRF_SECRET`, `CORS_ORIGIN`, `COOKIE_SECURE` | Clave privada; origen local; cookie false solo en HTTP local | Clave privada robusta, mismo origen y Secure/HTTPS |

## Verificación

```powershell
$env:FIREBASE_PROJECT_ID = 'demo-pulsolink'
npx -y firebase-tools@15.34.0 emulators:exec --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth 'npm run test --workspace=apps/api'
npm run typecheck
npm run build
```

No ejecutar la suite de integración contra un emulador compartido con datos valiosos. Los tests usan un proyecto `demo-` y datos seudónimos. Sin hosts se omiten las suites de persistencia; eso no equivale a haberlas aprobado. El emulador no acredita despliegue/disponibilidad de índices compuestos en Standard real. El frontend y dispositivos solo acceden a la API; nunca reciben credenciales administrativas.

El procedimiento completo de Gerson está automatizado en `./tools/firebase/verify-gerson.ps1`: exige Node 24, ejecuta tipos/build y pruebas con dos workers, y limpia únicamente el proceso Java de sus emuladores desechables si Firebase CLI lo deja vivo en Windows. Rechaza puertos de prueba ya ocupados. No sustituye las dependencias del equipo, el despliegue HTTPS ni la prueba de hardware. `.node-version` registra la versión usada; la restricción del manifiesto raíz sigue coordinada con Javier.
