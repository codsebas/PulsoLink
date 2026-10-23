# Render: web y API en un solo servicio

El servicio Node sirve React compilado y `/api/v1` desde el mismo origen HTTPS.
No se requiere un segundo servicio de frontend.

## Configuración del servicio

| Campo | Valor |
| --- | --- |
| Language | Node |
| Branch | main, después de integrar el cambio de alojamiento web |
| Root Directory | Vacío: instalar desde el lockfile de la raíz |
| Build Command | `npm ci --include=dev && npm run build:deploy` |
| Start Command | `npm run start --workspace=apps/api` |
| Health Check Path | `/api/v1/health` |

El build instala herramientas de compilación explícitamente, incluso con
`NODE_ENV=production`, y construye ambos workspaces. El entrypoint de producción
requiere `apps/web/dist/index.html`; si falta, termina con `WEB_BUILD_MISSING`
en vez de publicar una API sin pantalla de acceso. La ruta del build es absoluta
y se resuelve respecto del entrypoint compilado, independientemente del cwd.

## Variables y archivo secreto

| Variable | Valor |
| --- | --- |
| `NODE_VERSION` | `24.22.1` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://pulsolink-api.onrender.com`, si esa es la URL asignada al servicio |
| `COOKIE_SECURE` | `true` |
| `CSRF_SECRET` | Generar uno privado de al menos 32 caracteres en Render |
| `SESSION_TTL_HOURS` | `8` |
| `LOGIN_RATE_LIMIT_MAX` | `10` |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` |
| `FIREBASE_PROJECT_ID` | `pulsolink-pruebas-2026-7c8a31` |
| `FIREBASE_WEB_API_KEY` | Clave web del mismo proyecto Firebase |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/serviceAccountKey.json` |
| `VITE_API_BASE_URL` | `/api/v1`, disponible al construir React |
| `SESSION_SUMMARY_ENABLED` | `true` para activar PulsoAI después de integrar y revisar #72; `false` para deshabilitar |
| `GROQ_MODEL` | `openai/gpt-oss-20b` |
| `GROQ_API_KEY` | Clave privada de Groq, únicamente en Environment del backend |

Agregar en **Environment → Secret Files** un archivo llamado
`serviceAccountKey.json`, con el contenido del JSON administrativo autorizado
para el backend. No subirlo a Git ni colocarlo dentro de `apps/web`.

Usando ese archivo, no se necesitan `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`
por separado. Dejar que Render asigne `PORT`. No configurar hosts de emuladores
ni ejecutar aprovisionamiento/seeds en el proceso de arranque.

Si Render asigna otro hostname, actualizar `CORS_ORIGIN` con la URL real sin
ruta ni barra final. No usar el origen provisional `example.invalid` para login.

## Entrada y comprobaciones

Después de integrar este cambio, actualizar el **Build Command** y desplegar:

1. `/login` debe devolver la pantalla React con JavaScript/CSS cargados.
2. `/monitoring` y enlaces directos deben cargar la SPA; sin sesión, la web
   solicita login. La API sigue exigiendo su propia sesión y permisos.
3. `/api/v1/health` responde JSON. Inicialización cloud no sustituye una prueba
   real de login y persistencia.
4. Una ruta inexistente bajo `/api` o un asset ausente no devuelve `index.html`.
5. La ruta de prueba `/api/v1/dev/reading-test` continúa deshabilitada en production.

HTML se revalida y los assets Vite con hash se sirven con caché inmutable.
El origen es compartido por cookies, CSRF y API; el frontend no recibe secretos
administrativos. Desarrollo local conserva Vite y el proxy existentes.

## Verificación de esta entrega

Para PulsoAI, seguir la [suite de aceptación final de #72](../qa/pulsoai-aceptacion-final.md):
incluye configuración privada del proveedor, sesiones sintéticas por HTTPS,
persistencia independiente y recorrido de navegador con limpieza de fixtures.

Node 24.22.1: tipos de API y 73 pruebas aprobadas (14 de alojamiento y 59 de la
ruta temporal por entorno). Se comprueba navegación SPA, assets, caché y cabeceras,
404 JSON, no publicación de dotfiles, permisos de API y rechazo del arranque web
sin un build. `npm run build:deploy` también pasó con Node 24.22.1; Vite mantiene
la advertencia de tamaño del chunk principal existente, sin impedir el build.

Se inició el entrypoint compilado en production con cwd fuera del repositorio
y sin credenciales Firebase: `/login` 200, dos assets JS/CSS 200, ruta profunda
SPA 200 y CSRF 200. Se conservaron los 401 de usuario/dispositivo sin sesión o
credencial y los 404 de API desconocida, asset ausente, `.env` y diagnóstico de
desarrollo. Es una prueba HTTP del alojamiento; no se ejecutó un nuevo login
con contraseña ni una prueba visual en navegador.

Estas pruebas no escriben en Firebase real ni usan contraseñas de cuentas compartidas.
