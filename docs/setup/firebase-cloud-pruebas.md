# Firebase real — entorno de pruebas

Proyecto: `pulsolink-pruebas-2026-7c8a31` (**PulsoLink Pruebas**).
Base `(default)`, Cloud Firestore **Standard**, región `us-central1`, plan Spark.
Este entorno contiene únicamente cuentas y pacientes ficticios de pruebas.

## Configuración desplegada

- Authentication: correo y contraseña, configurado en `firebase.json`.
- Firestore: reglas existentes que deniegan todo acceso directo de clientes.
- Índices: los de `firebase/firestore.indexes.json`. El despliegue puede finalizar
  antes de que Google termine de construirlos; las consultas compuestas deben
  verificarse después de que estén listos.
- Cuenta del backend local: `pulsolink-api-local`, con `roles/datastore.user`
  y `roles/firebaseauth.admin` en este proyecto de pruebas.

El Admin SDK accede desde Express; el frontend sigue consumiendo la API con
cookies de sesión y CSRF. Las reglas no sustituyen los controles de la API.

## Desarrollo conectado a la nube

En el equipo configurado, `apps/api/.env` contiene el ID del proyecto, la clave
web de Authentication y `GOOGLE_APPLICATION_CREDENTIALS`. No se versiona.
La clave privada está fuera del repositorio y de OneDrive, bajo
`%LOCALAPPDATA%/PulsoLink/pulsolink-pruebas-2026-7c8a31/`, con permisos locales
restringidos. Las cuentas ficticias de administrador y consulta se guardan en
`cuentas-pruebas.json` en esa carpeta; no publicar sus contraseñas.

Para otro equipo, aprovisionar credenciales propias y configurar su entorno;
no copiar claves privadas a Git ni enviarlas por mensajes. En un despliegue
administrado, utilizar identidad de servicio y Application Default Credentials.

Desde la raíz, con Node.js 24:

```powershell
npm run dev
```

No definir `FIRESTORE_EMULATOR_HOST` ni `FIREBASE_AUTH_EMULATOR_HOST` para usar
este entorno. `COOKIE_SECURE=false` corresponde únicamente al desarrollo HTTP
local; el despliegue HTTPS debe usar cookies seguras y el origen real.

## Despliegues reproducibles

El alias `pruebas` está versionado, sin establecer un proyecto predeterminado.
Indicar siempre el destino para evitar confundir nube y emuladores:

```powershell
npx -y firebase-tools@15.34.0 deploy --only firestore --project pruebas
npx -y firebase-tools@15.34.0 deploy --only auth --project pruebas
npx -y firebase-tools@15.34.0 firestore:databases:get '(default)' --project pruebas
```

Los scripts de seed y verificación de emuladores conservan su restricción a
proyectos de demostración; no deben ejecutarse contra este proyecto real.

## Evidencia ejecutada

Verificación con Node.js 24 y la aplicación Express real (Supertest), sin
emuladores ni sustitución de servicios de Firebase, el **22 de octubre de 2026
a las 05:07 UTC** (21 de octubre, 23:07 en Guatemala), desde `abc4d45`:

| Comprobación | Resultado |
| --- | --- |
| Login de administrador y creación de cookie HttpOnly | 200 |
| Creación de paciente ficticio por la API | 201 |
| Lectura persistida mediante Admin SDK y listado por la API | Correctos; listado 200 |
| Login de usuario viewer | 200 |
| Intento de crear paciente con viewer | 403 |
| Acceso REST directo a Firestore sin sesión | 403 |
| Acceso REST directo con ID token de usuario administrador | 403 |
| Auditoría de login y creación en Cloud Firestore | Documentos presentes |

El listado falló inicialmente mientras Google construía el índice; pasó después
de su activación. El resultado no acredita todos los filtros ni el recorrido
completo dispositivo–asignación–sesión–lecturas en este entorno cloud.

## Pendiente de integración

La API y el frontend pueden ejecutarse localmente usando Firebase real.
Esta configuración no publica Express ni Vite en Internet, ni acredita la
integración con la placa física. El despliegue HTTPS y la prueba de hardware
siguen siendo pasos de integración del equipo.
