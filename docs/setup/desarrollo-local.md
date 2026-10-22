# Guía de Configuración y Desarrollo Local — PulsoLink

Instrucciones paso a paso para configurar, compilar y ejecutar el proyecto PulsoLink en un entorno de desarrollo **Windows con PowerShell**.

---

## 1. Prerrequisitos y Versiones

Asegúrese de contar con las siguientes herramientas instaladas y accesibles en su terminal:

| Herramienta | Versión recomendada | Verificación en PowerShell |
| :--- | :--- | :--- |
| **Node.js** | `>= 24.0.0` (Node 24 LTS; declarado en `engines` de la raíz, `apps/api`, `apps/web` y `tools/device-simulator`) | `node --version` |
| **npm** | `>= 10.0.0` | `npm --version` |
| **Git** | `>= 2.40.0` | `git --version` |
| **PowerShell** | Versión 5.1 o PowerShell 7+ | `$PSVersionTable.PSVersion` |

---

## 2. Clonación e Instalación desde la Raíz

Abra una ventana de PowerShell y ejecute:

```powershell
# Ubíquese en el directorio de trabajo (con comillas si hay espacios)
Set-Location "C:\Users\sebas\UMG\Octavo Ciclo\Desarrollo Web\Proyecto-Final\PulsoLink"

# Instalación inicial de dependencias para todo el monorepositorio
npm install
```

Para instalaciones reproducibles en entornos limpios o CI:
```powershell
npm ci
```

---

## 3. Preparación de Variables de Entorno

Copie las plantillas `.env.example` a sus archivos locales `.env`:

```powershell
# Configuración del Backend (API)
Copy-Item "apps\api\.env.example" "apps\api\.env"

# Configuración del Frontend Web
Copy-Item "apps\web\.env.example" "apps\web\.env"

# Configuración del Simulador IoT
Copy-Item "tools\device-simulator\.env.example" "tools\device-simulator\.env"
```

> **Nota de Seguridad:** Los archivos `.env` generados están incluidos en el `.gitignore`. Nunca agregue contraseñas, claves privadas de Firebase ni tokens a Git.

---

## 4. Comandos de Arranque y URLs de Desarrollo

El monorepositorio utiliza `npm workspaces` y `concurrently` para ejecutar los servicios simultáneamente:

### 4.1 Iniciar todo el entorno (Web + API)
```powershell
npm run dev
```
Esto levantará:
- **Backend API:** `http://localhost:3001`
- **Frontend Web:** `http://localhost:5173`

### 4.2 Iniciar servicios individualmente
- Para iniciar solo la API:
  ```powershell
  npm run dev:api
  ```
- Para iniciar solo el Frontend:
  ```powershell
  npm run dev:web
  ```
- Para iniciar el Simulador:
  ```powershell
  npm run dev --workspace=tools/device-simulator
  ```

---

## 5. Verificación de Conectividad y Health Check

Una vez iniciados los servicios, verifique la conectividad desde PowerShell o desde su navegador:

### Vía PowerShell:
```powershell
# Verificar respuesta JSON de la API
Invoke-RestMethod -Uri "http://localhost:3001/api/v1/health"

# Verificar proxy de Vite a través del frontend
Invoke-RestMethod -Uri "http://localhost:5173/api/v1/health"
```

Respuesta esperada:
```json
{
  "status": "ok",
  "service": "pulsolink-api",
  "version": "0.1.0",
  "timestamp": "2026-10-17T...",
  "uptimeSeconds": 15,
  "firebase": {
    "configured": false,
    "mode": "uninitialized"
  }
}
```

### Vía Navegador:
Abra `http://localhost:5173` en su navegador. La pantalla de bienvenida consultará automáticamente el endpoint de salud e indicará **"Conexión con la API Exitosa"**.

---

## 6. Compilación, Comprobación de Tipos y Lint

Para ejecutar las comprobaciones disponibles del monorepositorio:

```powershell
# Comprobar tipos TypeScript sin emitir código
npm run typecheck

# Compilar todas las aplicaciones a producción
npm run build

# Verificación real por workspace: typecheck + build + test (API, web y simulador)
npm run lint

# Verificación completa: la de todos los workspaces y la puerta local de aceptación del historial
npm run verify
```

La capa de historial tiene dos puertas de aceptación:

```powershell
# Puerta local: mismo escenario sobre la capa de datos, sin backend ni emuladores
node tools/qa/history-continuity-acceptance.cjs

# Recorrido real de QA: endpoint oficial y navegador (necesita API, web, emuladores y Edge)
node tools/qa/hugo-history-acceptance.cjs
```

### 6.1 Estado conocido de las comprobaciones

La ejecución local registrada el 22 de octubre de 2026, tras `npm install`, produjo el siguiente resultado:

| Comando | Resultado | Alcance y observaciones |
| --- | --- | --- |
| `npm run typecheck` | Correcto | API, web y simulador completan la comprobación sin errores de tipos. |
| `npm run build` | Correcto | API, web (`vite build`) y simulador compilan. |
| `npm run lint` | Correcto | Los scripts de API y web ya no imprimen un `echo`: ejecutan `typecheck`, `build` y `test`; el simulador ejecuta `typecheck`, `build` y `test`. |
| `npm run verify` | Correcto | Encadena la verificación de los tres workspaces con la puerta local de aceptación del historial. |
| `node tools/qa/history-continuity-acceptance.cjs` | Correcto | Verifica los criterios HIST-01 e HIST-02 de la capa de historial del frontend; no requiere emuladores. |

Los detalles reproducibles de la capa de historial están en [la evidencia de PL2-07](../evidencias/monitoreo-pl2-07.md).

### 6.2 Pruebas de persistencia con emuladores

La suite de persistencia requiere Java 21 o posterior y los emuladores de Firestore y Authentication. Se ejecuta sobre el proyecto local desechable `demo-pulsolink`; no configura ni modifica recursos en la nube:

```powershell
$env:FIREBASE_PROJECT_ID = 'demo-pulsolink'
npx -y firebase-tools@latest emulators:exec --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth 'npm run test --workspace=apps/api'
```

Sin ambos hosts de emulador, los casos de persistencia se omiten. No presente esa omisión como una prueba integrada aprobada.

### 6.3 Contratos y orden de integración

Los contratos versionados son la fuente de integración: [Contrato A](../../contracts/device.openapi.yaml) para dispositivo/simulador y [Contrato B](../../contracts/web.openapi.yaml) para la web. Ambos usan el prefijo `/api/v1`.

| Componente | Consume o proporciona | Dependencia actual |
| --- | --- | --- |
| `apps/web` | Consume Contrato B por el proxy Vite `/api` | Requiere autenticación, sesiones y consultas HTTP implementadas en API. |
| `apps/api` | Proporciona ambos contratos y usa Firebase Admin SDK | Requiere configuración Firebase para operaciones persistentes; no expone Firestore al cliente. |
| `tools/device-simulator` | Consume Contrato A con credencial de dispositivo | Requiere endpoints de dispositivo, credencial aprovisionada y una sesión activa. |
| `firebase/` | Reglas, índices y emuladores de Firestore/Auth | La API usa Admin SDK; las reglas bloquean el acceso directo de clientes. |

Al momento de esta guía, `GET /api/v1/health` está operativo y `GET /api/v1/auth/csrf` genera un token básico. Las rutas de autenticación, dispositivos, sesiones y dispositivo responden `501 NOT_IMPLEMENTED`; los repositorios Firestore existen, pero todavía no están conectados a esas rutas. El simulador y las pantallas de sesión/monitoreo son esqueletos de integración. Esta condición bloquea el recorrido completo, pero no bloquea el arranque de API y web.

---

## 7. Configuración de Firebase Pendiente

La base ejecutable actual está diseñada para arrancar **sin credenciales de Firebase**, permitiendo el desarrollo de pantallas y contratos sin bloqueos.

Cuando el responsable de Firebase (`@gioore` - Issue #6) aprovisione la base de datos:
1. Cree un proyecto en la consola de Firebase.
2. Habilite **Cloud Firestore** en edición **Standard**.
3. Genere una clave privada de cuenta de servicio (`serviceAccountKey.json`).
4. Configure en `apps/api/.env`:
   ```env
   FIREBASE_PROJECT_ID=pulsolink-dev
   GOOGLE_APPLICATION_CREDENTIALS=C:\ruta\segura\serviceAccountKey.json
   ```
5. Al reiniciar la API (`npm run dev:api`), el campo `firebase.configured` en `/api/v1/health` cambiará automáticamente a `true`.

---

## 8. Solución de Problemas Comunes

### 8.1 Puerto en uso (EADDRINUSE: 3001 o 5173)
Si otro proceso ocupa el puerto, averigüe el PID y deténgalo:
```powershell
# Buscar proceso ocupando el puerto 3001
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object OwningProcess

# Detener el proceso si es necesario
Stop-Process -Id <PID> -Force
```
Alternativamente, modifique el puerto en `apps/api/.env` (`PORT=3002`) y actualice `VITE_API_PROXY_TARGET=http://localhost:3002` en `apps/web/.env`.

### 8.2 Error de CORS o Cookies no reconocidas
Asegúrese de que el origen `CORS_ORIGIN` en `apps/api/.env` coincida exactamente con la URL del frontend (`http://localhost:5173`).
